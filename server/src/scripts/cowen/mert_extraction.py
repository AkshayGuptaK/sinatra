import argparse
import os
import re
import warnings
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Union

import numpy as np
import pandas as pd
import torch
import torchaudio.functional as F
from transformers import AutoModel, Wav2Vec2FeatureExtractor

from src.config import config
from src.sources import FileSystemSource

# Suppress PyTorch STFT internal tensor resize deprecation warning
warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r".*An output with one or more elements was resized.*",
)

PARQUET_PATH = config["project_root"] / "datasets" / "cowen.parquet"


def sanitize_model_name(model_id: str) -> str:
    """Converts a HuggingFace model ID like 'm-a-p/MERT-v2-30s' to a filesystem-friendly string."""
    name = model_id.split("/")[-1]
    return re.sub(r"[^\w\-.]", "_", name)


def parse_layer_arg(layer_val: Union[str, int], total_layers: int) -> int:
    """Converts layer arguments (1-based, 0-based, or -1) to valid 0-based hidden_state indices."""
    idx = int(layer_val)
    if idx < 0:
        # e.g. -1 -> last hidden state (total_layers - 1)
        resolved = total_layers + idx
    elif idx == total_layers:
        # User passed 24 for a 24-layer model (1-based convention)
        resolved = total_layers - 1
    elif 0 <= idx < total_layers:
        resolved = idx
    elif 1 <= idx <= total_layers:
        resolved = idx - 1
    else:
        raise ValueError(
            f"Layer {layer_val} is out of bounds for model with {total_layers} layers."
        )

    return resolved


def extract_embeddings_for_cowen(
    model_id: str = "m-a-p/MERT-v2-30s",
    layers: Sequence[Union[int, str]] = ("16", "-1"),
    output_dir: Optional[Union[str, Path]] = None,
    device: Optional[str] = None,
    target_sr: int = 24000,
    max_duration_seconds: int = 30,
):
    if device is None:
        if torch.backends.mps.is_available():
            device = "mps"
        elif torch.cuda.is_available():
            device = "cuda"
        else:
            device = "cpu"

    print(f"\n=======================================================")
    print(f"🎵 Model:   {model_id}")
    print(f"⚡ Device:  {device}")
    print(f"🎯 Target Sample Rate: {target_sr} Hz")
    print(f"=======================================================\n")

    if not PARQUET_PATH.exists():
        raise FileNotFoundError(f"Source dataset not found at: {PARQUET_PATH}")

    # 1. Load Processor and Model
    print(f"Loading processor and model weights for [{model_id}]...")
    processor = Wav2Vec2FeatureExtractor.from_pretrained(
        model_id, trust_remote_code=True
    )
    model = AutoModel.from_pretrained(model_id, trust_remote_code=True).to(device)
    model.eval()

    # Determine num layers safely
    num_layers = getattr(
        model.config,
        "num_hidden_layers",
        getattr(model.config, "encoder_layers", 24),
    )

    # Map requested layer strings to safe 0-based indices and output labels
    # e.g., '14' -> index 13, '16' -> index 15, '-1' or '24' -> index -1
    target_layers: List[Tuple[int, str]] = []
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

        # 3. Robust in-memory decoding via FFmpeg
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

        if waveform.shape[-1] > max_samples:
            start = (waveform.shape[-1] - max_samples) // 2
            waveform = waveform[:, start : start + max_samples]

        wav_np = waveform.squeeze(0).numpy()

        # 4. Model Forward Pass
        try:
            inputs = processor(
                wav_np, sampling_rate=target_sr, return_tensors="pt", padding=True
            )
            inputs_tensor = {k: v.to(device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = model(**inputs_tensor, output_hidden_states=True)
                hidden_states = outputs.hidden_states

            base_meta = {k: v for k, v in row.items() if k != "audio"}

            # 5. Extract and mean-pool requested layers
            for layer_idx, layer_name in target_layers:
                # Using layer_idx directly (-1 works natively on tuples)
                layer_tensor = hidden_states[layer_idx]
                pooled_vec = layer_tensor.squeeze(0).mean(dim=0).cpu().numpy()

                rec = dict(base_meta)
                for dim_idx, val in enumerate(pooled_vec):
                    rec[f"mert_{dim_idx}"] = float(val)

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
        description="Extract arbitrary MERT model embeddings and layers for Cowen dataset."
    )
    parser.add_argument(
        "--model",
        type=str,
        default="m-a-p/MERT-v2-30s",
        help="HuggingFace model identifier (e.g. m-a-p/MERT-v2-30s, m-a-p/MERT-v1-330M).",
    )
    parser.add_argument(
        "--layers",
        nargs="+",
        default=["16", "-1"],
        help="One or more layer indices to extract (e.g. --layers 14 16 19 23 -1). Use -1 for final output layer.",
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
        default=24000,
        help="Audio sample rate (default: 24000).",
    )

    args = parser.parse_args()

    extract_embeddings_for_cowen(
        model_id=args.model,
        layers=args.layers,
        output_dir=args.output_dir,
        target_sr=args.sr,
    )


if __name__ == "__main__":
    main()
