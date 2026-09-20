from pathlib import Path
import numpy as np
import pandas as pd
import torch
import torchaudio.functional as F
from transformers import AutoProcessor, ClapModel

from src.sources import FileSystemSource


def extract_clap():
    parquet_path = Path("datasets/cowen.parquet")
    output_csv = Path("datasets/cowen_clap_embeddings.csv")

    if not parquet_path.exists():
        print(f"File not found: {parquet_path}")
        return

    # 1. Setup device (CUDA > MPS > CPU)
    if torch.cuda.is_available():
        device = "cuda"
    elif torch.backends.mps.is_available():
        device = "mps"
    else:
        device = "cpu"
    print(f"Loading laion/larger_clap_music on {device}...")

    model_id = "laion/larger_clap_music"
    processor = AutoProcessor.from_pretrained(model_id)
    model = ClapModel.from_pretrained(model_id).to(device)
    model.eval()

    target_sr = 48000  # LAION-CLAP requires 48 kHz

    print(f"Reading {parquet_path}...")
    df = pd.read_parquet(parquet_path)
    total = len(df)
    print(f"Loaded {total} samples.")

    records = []

    for i, row in df.iterrows():
        audio_entry = row.get("audio")
        if audio_entry is None:
            continue

        waveform = None

        # 2. Decode audio via FFmpeg stdin pipe (preserving existing zero-soundfile pattern)
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

        # Ensure mono
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        # Center crop / cap at 30 seconds (CLAP window limit is 10-30s)
        max_samples = 30 * target_sr
        if waveform.shape[-1] > max_samples:
            start = (waveform.shape[-1] - max_samples) // 2
            waveform = waveform[:, start : start + max_samples]

        wav_np = waveform.squeeze(0).numpy()

        # 3. Extract CLAP 512-dim Embedding
        try:
            inputs = processor(
                audio=wav_np,
                sampling_rate=target_sr,
                return_tensors="pt"
            )
            # Send tensor inputs to device
            inputs = {k: v.to(device) for k, v in inputs.items()}

            with torch.no_grad():
                outputs = model.get_audio_features(**inputs)
                # Check if outputs is wrapped in BaseModelOutputWithPooling
                tensor_embeds = getattr(outputs, "pooler_output", outputs)
                if not isinstance(tensor_embeds, torch.Tensor) and hasattr(outputs, "audio_features"):
                    tensor_embeds = outputs.audio_features
                if not isinstance(tensor_embeds, torch.Tensor):
                    tensor_embeds = outputs[0]
            
                embedding = tensor_embeds.squeeze(0).cpu().numpy().flatten()

            record = {k: v for k, v in row.items() if k != "audio"}
            for dim_idx, val in enumerate(embedding):
                record[f"clap_{dim_idx}"] = float(val)

            records.append(record)

        except Exception as e:
            print(f"Error extracting row {i}: {e}")

        if (i + 1) % 25 == 0 or (i + 1) == total:
            print(f"Processed {i + 1}/{total} tracks...", end="\r", flush=True)

    print(f"\nWriting embeddings to {output_csv}...")
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    out_df = pd.DataFrame(records)
    out_df.to_csv(output_csv, index=False)
    print(
        f"Finished. Saved {len(out_df)} rows with {len(out_df.columns)} columns to {output_csv}"
    )


if __name__ == "__main__":
    extract_clap()