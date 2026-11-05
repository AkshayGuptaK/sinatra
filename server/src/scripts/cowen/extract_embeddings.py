import argparse
import os
from pathlib import Path
import re
from typing import Dict, List, Optional, Sequence, Tuple, Union
import warnings

import numpy as np
import pandas as pd
from src.config import config
from src.sources import FileSystemSource
import torch
import torch.nn.functional as F_nn
import torchaudio.functional as F
from transformers import (
    AutoModel,
    ClapModel,
    ClapProcessor,
    Wav2Vec2FeatureExtractor,
)

# Suppress PyTorch STFT internal tensor resize deprecation warning
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r".*An output with one or more elements was resized.*",
)

PARQUET_PATH = config["project_root"] / "datasets" / "cowen.parquet"

MODE_DEFAULTS = {
    "mert": {
        "model_id": "m-a-p/MERT-v2-30s",
        "target_sr": 24000,
        "max_duration_seconds": 30,
        "layers": ["16", "-1"],
        "feature_prefix": "mert",
    },
    "clap": {
        "model_id": "laion/clap-htsat-unfused",
        "target_sr": 48000,
        "max_duration_seconds": 10,
        "layers": ["final"],
        "feature_prefix": "clap",
    },
}


def sanitize_model_name(model_id: str) -> str:
    """Converts a HuggingFace model ID like 'laion/clap-htsat-unfused' to a filesystem-friendly string."""
    name = model_id.split("/")[-1]
    return re.sub(r"[^\w\-.]", "_", name)


def load_model_and_processor(mode: str, model_id: str, device: str):
    """Loads appropriate Hugging Face processor and model strictly from local files."""
    print(f"Loading {mode.upper()} processor and model weights for [{model_id}] locally...")
    if mode == "clap":
        processor = ClapProcessor.from_pretrained(
            model_id,
            local_files_only=True,
        )
        model = ClapModel.from_pretrained(
            model_id,
            local_files_only=True,
        ).to(device)
    else:
        processor = Wav2Vec2FeatureExtractor.from_pretrained(
            model_id,
            trust_remote_code=True,
            local_files_only=True,
        )
        model = AutoModel.from_pretrained(
            model_id,
            trust_remote_code=True,
            local_files_only=True,
        ).to(device)

    model.eval()
    return processor, model


def resolve_target_layers(
    mode: str,
    model,
    layers: Sequence[Union[int, str]],
) -> List[Tuple[Union[int, str], str]]:
    """
    Resolves requested layer arguments into extraction keys and clean filename labels.
    - For MERT: resolves 0-based/1-based hidden state indices (e.g., '16' -> (15, 'L16')).
    - For CLAP: supports 'final'/'projection'/'-1' for the 512-D joint projection space,
      or integer indices for audio_model hidden states.
    """
    target_layers: List[Tuple[Union[int, str], str]] = []

    if mode == "clap":
        num_layers = getattr(
            getattr(model, "audio_model", model).config,
            "num_hidden_layers",
            4,
        )
        for l_val in layers:
            l_str = str(l_val).strip().lower()
            if l_str in ("final", "projection", "embed", "-1"):
                target_layers.append(("projection", "final"))
            else:
                try:
                    l_int = int(l_str)
                    if 0 <= l_int < num_layers:
                        target_layers.append((l_int, f"L{l_int}"))
                    elif 1 <= l_int <= num_layers:
                        target_layers.append((l_int - 1, f"L{l_int}"))
                    else:
                        raise ValueError(
                            f"Layer {l_val} out of bounds for CLAP audio model ({num_layers} layers)."
                        )
                except ValueError:
                    raise ValueError(f"Unrecognized CLAP layer target: {l_val}")
    else:
        num_layers = getattr(
            model.config,
            "num_hidden_layers",
            getattr(model.config, "encoder_layers", 24),
        )
        for l_val in layers:
            l_str = str(l_val).strip()
            l_int = int(l_str)
            if l_int == -1 or l_int == num_layers:
                target_layers.append((-1, f"L{num_layers}_final"))
            elif 1 <= l_int <= num_layers:
                target_layers.append((l_int - 1, f"L{l_int}"))
            elif 0 <= l_int < num_layers:
                target_layers.append((l_int, f"L{l_int + 1}"))
            else:
                raise ValueError(
                    f"Layer {l_val} out of bounds for {num_layers}-layer model."
                )

    return target_layers


def extract_embeddings_for_cowen(
    mode: str = "mert",
    model_id: Optional[str] = None,
    layers: Optional[Sequence[Union[int, str]]] = None,
    output_dir: Optional[Union[str, Path]] = None,
    device: Optional[str] = None,
    target_sr: Optional[int] = None,
    max_duration_seconds: Optional[int] = None,
    feature_prefix: Optional[str] = None,
):
    mode = mode.lower().strip()
    if mode not in MODE_DEFAULTS:
        raise ValueError(
            f"Mode must be one of {list(MODE_DEFAULTS.keys())}, got '{mode}'"
        )

    # Apply mode-specific defaults if not explicitly provided
    defaults = MODE_DEFAULTS[mode]
    model_id = model_id or defaults["model_id"]
    target_sr = target_sr or defaults["target_sr"]
    max_duration_seconds = max_duration_seconds or defaults["max_duration_seconds"]
    layers = layers or defaults["layers"]
    feature_prefix = feature_prefix or defaults["feature_prefix"]

    if device is None:
        if torch.backends.mps.is_available():
            device = "mps"
        elif torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"

    print(f"\n=======================================================")
    print(f"🔧 Mode:    {mode.upper()}")
    print(f"🎵 Model:   {model_id}")
    print(f"⚡ Device:  {device}")
    print(f"🎯 Target Sample Rate: {target_sr} Hz")
    print(f"⏱️  Max Duration:     {max_duration_seconds}s")
    print(f"🏷️  Feature Prefix:   {feature_prefix}_*")
    print(f"=======================================================\n")

    if not PARQUET_PATH.exists():
        raise FileNotFoundError(f"Source dataset not found at: {PARQUET_PATH}")

    # 1. Load Processor and Model
    processor, model = load_model_and_processor(mode, model_id, device)
    target_layers = resolve_target_layers(mode, model, layers)

    out_base_dir = (
        Path(output_dir) if output_dir else config["project_root"] / "datasets"
    )
    out_base_dir.mkdir(parents=True, exist_ok=True)
    model_tag = sanitize_model_name(model_id)

    # Destination CSV paths and in-memory accumulator per layer
    layer_csv_targets = {
        name: out_base_dir / f"cowen_{model_tag}_{name}_embeddings.csv"
        for _, name in target_layers
    }
    layer_records: Dict[str, List[dict]] = {name: [] for _, name in target_layers}

    print("Extraction targets:")
    for _, name in target_layers:
        print(f"  • {name} -> {layer_csv_targets[name].name}")

    # 2. Read dataset
    print(f"\nReading dataset from {PARQUET_PATH}...")
    df = pd.read_parquet(PARQUET_PATH)
    total_tracks = len(df)
    print(f"Loaded {total_tracks} tracks.\n")

    max_samples = max_duration_seconds * target_sr

    for i, row in df.iterrows():
        audio_entry = row.get("audio")
        if audio_entry is None:
            continue

        waveform = None

        # 3. Robust in-memory decoding via FFmpeg / array resampling
        if isinstance(audio_entry, dict):
            if audio_entry.get("bytes") is not None:
                waveform = FileSystemSource.read_bytes(
                    audio_entry["bytes"], target_sr=target_sr, channels=1
                )
            elif "array" in audio_entry:
                raw_arr = np.array(audio_entry["array"], dtype=np.float32)
                orig_sr = audio_entry.get("sampling_rate", 44100)
                t = (
                    torch.from_numpy(raw_arr).unsqueeze(0)
                    if raw_arr.ndim == 1
                    else torch.from_numpy(raw_arr).mean(dim=0, keepdim=True)
                )
                waveform = F.resample(t, orig_sr, target_sr)
        elif isinstance(audio_entry, bytes):
            waveform = FileSystemSource.read_bytes(
                audio_entry, target_sr=target_sr, channels=1
            )

        if waveform is None:
            continue

        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        # Center-crop audio if longer than max duration
        if waveform.shape[-1] > max_samples:
            start = (waveform.shape[-1] - max_samples) // 2
            waveform = waveform[:, start : start + max_samples]

        wav_np = waveform.squeeze(0).numpy()

        # 4. Model Forward Pass
        try:
            base_meta = {k: v for k, v in row.items() if k != "audio"}

            if mode == "clap":
                inputs = processor(
                    audio=wav_np,
                    sampling_rate=target_sr,
                    return_tensors="pt",
                )
                inputs_tensor = {k: v.to(device) for k, v in inputs.items()}

                with torch.no_grad():
                    # 5a. Extract CLAP targets
                    for layer_target, layer_name in target_layers:
                        if layer_target == "projection":
                            # Extract 512-D joint audio embedding
                            feat = model.get_audio_features(**inputs_tensor)

                            # Unwrap BaseModelOutputWithPooling container if needed
                            if not isinstance(feat, torch.Tensor):
                                if (
                                    hasattr(feat, "audio_embeds")
                                    and feat.audio_embeds is not None
                                ):
                                    feat = feat.audio_embeds
                                elif (
                                    hasattr(feat, "pooler_output")
                                    and feat.pooler_output is not None
                                ):
                                    feat = feat.pooler_output
                                else:
                                    feat = feat[0]

                            if (
                                feat.shape[-1] != 512
                                and hasattr(model, "audio_projection")
                                and callable(model.audio_projection)
                            ):
                                feat = model.audio_projection(feat)

                            # Joint spaces expect L2-normalized embeddings
                            feat = F_nn.normalize(feat, dim=-1)
                            pooled_vec = feat.squeeze(0).cpu().numpy()
                        else:
                            # Intermediate HTS-AT encoder hidden states
                            audio_out = model.audio_model(
                                **inputs_tensor, output_hidden_states=True
                            )
                            layer_tensor = audio_out.hidden_states[layer_target]
                            pooled_vec = (
                                layer_tensor.squeeze(0).mean(dim=0).cpu().numpy()
                            )

                        rec = dict(base_meta)
                        for dim_idx, val in enumerate(pooled_vec):
                            rec[f"{feature_prefix}_{dim_idx}"] = float(val)

                        layer_records[layer_name].append(rec)

            else:
                # 5b. Extract MERT targets
                inputs = processor(
                    wav_np, sampling_rate=target_sr, return_tensors="pt", padding=True
                )
                inputs_tensor = {k: v.to(device) for k, v in inputs.items()}

                with torch.no_grad():
                    outputs = model(**inputs_tensor, output_hidden_states=True)
                    hidden_states = outputs.hidden_states

                for layer_idx, layer_name in target_layers:
                    layer_tensor = hidden_states[layer_idx]
                    pooled_vec = layer_tensor.squeeze(0).mean(dim=0).cpu().numpy()

                    rec = dict(base_meta)
                    for dim_idx, val in enumerate(pooled_vec):
                        rec[f"{feature_prefix}_{dim_idx}"] = float(val)

                    layer_records[layer_name].append(rec)

        except Exception as e:
            print(f"\n⚠️  Error extracting row {i}: {e}")

        if (i + 1) % 25 == 0 or (i + 1) == total_tracks:
            print(f"Processed {i + 1}/{total_tracks} tracks...", end="\r", flush=True)

    # 6. Save each layer to its respective CSV
    print("\n\nFlushing embeddings to CSV...")
    for _, name in target_layers:
        csv_path = layer_csv_targets[name]
        records = layer_records[name]
        if not records:
            print(f"⚠️  No records captured for {name}. Skipping {csv_path.name}")
            continue

        out_df = pd.DataFrame(records)
        out_df.to_csv(csv_path, index=False)
        print(
            f"✅ Saved [{len(out_df)} rows x {len(out_df.columns)} cols] to {csv_path.name}"
        )


def main():
    parser = argparse.ArgumentParser(
        description="Extract audio embeddings (MERT or LAION-CLAP) for the Cowen dataset."
    )
    parser.add_argument(
        "--mode",
        type=str,
        choices=["mert", "clap"],
        default="mert",
        help="Model architecture mode: 'mert' (default) or 'clap'.",
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="HuggingFace model ID. Defaults to 'm-a-p/MERT-v2-30s' (mert) or 'laion/clap-htsat-unfused' (clap).",
    )
    parser.add_argument(
        "--layers",
        nargs="+",
        default=None,
        help="Layer(s) to extract. For MERT: indices (e.g. 16 -1). For CLAP: 'final' (default 512-D projection) or encoder layer indices.",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default=None,
        help="Custom output directory. Defaults to <project_root>/datasets/.",
    )
    parser.add_argument(
        "--sr",
        type=int,
        default=None,
        help="Sample rate. Defaults to 24000 Hz for MERT and 48000 Hz for CLAP.",
    )
    parser.add_argument(
        "--max-duration",
        type=int,
        default=None,
        help="Maximum clip duration in seconds. Defaults to 30s for MERT and 10s for CLAP.",
    )
    parser.add_argument(
        "--feature-prefix",
        type=str,
        default=None,
        help="Prefix for CSV embedding columns (e.g., 'mert' -> mert_0, 'clap' -> clap_0).",
    )

    args = parser.parse_args()

    extract_embeddings_for_cowen(
        mode=args.mode,
        model_id=args.model,
        layers=args.layers,
        output_dir=args.output_dir,
        target_sr=args.sr,
        max_duration_seconds=args.max_duration,
        feature_prefix=args.feature_prefix,
    )


if __name__ == "__main__":
    main()
