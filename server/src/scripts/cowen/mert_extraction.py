from pathlib import Path
import numpy as np
import pandas as pd
import torch
import torchaudio.functional as F
from transformers import AutoModel, Wav2Vec2FeatureExtractor

from src.sources import FileSystemSource
from src.config import config

PARQUET_PATH = config["project_root"] / "datasets" / "cowen.parquet"
OUTPUT_CSV = config["project_root"] / "datasets" / "cowen_mert_embeddings.csv"


def extract_mert():
    # Setup device
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"Loading MERT-v1-330M on {device}...")

    model_id = "m-a-p/MERT-v1-330M"
    processor = Wav2Vec2FeatureExtractor.from_pretrained(
        model_id, trust_remote_code=True
    )
    model = AutoModel.from_pretrained(model_id, trust_remote_code=True).to(device)
    model.eval()

    target_sr = 24000  # MERT requires 24kHz

    print(f"Reading {PARQUET_PATH}...")
    df = pd.read_parquet(PARQUET_PATH)
    total = len(df)
    print(f"Loaded {total} samples.")

    records = []

    for i, row in df.iterrows():
        audio_entry = row.get("audio")
        if audio_entry is None:
            continue

        waveform = None

        # 1. Decode audio via FFmpeg stdin pipe (zero soundfile dependency)
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

        # Center crop / cap at 30 seconds
        max_samples = 30 * target_sr
        if waveform.shape[-1] > max_samples:
            start = (waveform.shape[-1] - max_samples) // 2
            waveform = waveform[:, start : start + max_samples]

        wav_np = waveform.squeeze(0).numpy()

        # 2. Extract MERT 768-dim Embedding
        try:
            inputs = processor(wav_np, sampling_rate=target_sr, return_tensors="pt").to(
                device
            )

            with torch.no_grad():
                outputs = model(**inputs, output_hidden_states=True)
                last_hidden = outputs.last_hidden_state
                # Mean-pool across the time dimension: (1, time, 768) -> (768,)
                mean_embedding = last_hidden.squeeze(0).mean(dim=0).cpu().numpy()

            record = {k: v for k, v in row.items() if k != "audio"}
            for dim_idx, val in enumerate(mean_embedding):
                record[f"mert_{dim_idx}"] = float(val)

            records.append(record)

        except Exception as e:
            print(f"Error extracting row {i}: {e}")

        if (i + 1) % 25 == 0 or (i + 1) == total:
            print(f"Processed {i + 1}/{total} tracks...", end="\r", flush=True)

    print(f"\nWriting embeddings to {OUTPUT_CSV}...")
    OUTPUT_CSV.parent.mkdir(parents=True, exist_ok=True)
    out_df = pd.DataFrame(records)
    out_df.to_csv(OUTPUT_CSV, index=False)
    print(
        f"Finished. Saved {len(out_df)} rows with {len(out_df.columns)} columns to {OUTPUT_CSV}"
    )


if __name__ == "__main__":
    extract_mert()
