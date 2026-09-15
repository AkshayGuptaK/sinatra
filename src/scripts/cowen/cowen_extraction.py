import io
import math
from pathlib import Path
import numpy as np
import pandas as pd
import torch
import torchaudio.functional as F
from demucs.apply import apply_model

from src.analysis.demucs_features import get_demucs_feature
from src.analysis.torch_features import get_torch_feature
from src.sources import FileSystemSource


def sanitize_dict(d: dict) -> dict:
    """Replaces NaN/Inf values with 0.0 to prevent training issues."""
    clean = {}
    for k, v in d.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            clean[k] = 0.0
        else:
            clean[k] = v
    return clean


def extract_features_from_audio(
    audio_data, torch_extractor, demucs_extractor
) -> dict | None:
    try:
        demucs_sr = demucs_extractor.model_sr

        # 1. Decode audio (normalized to demucs_sr, stereo)
        if isinstance(audio_data, dict):
            if audio_data.get("bytes") is not None:
                waveform = FileSystemSource.read_bytes(
                    audio_data["bytes"], target_sr=demucs_sr, channels=2
                )
            elif "array" in audio_data:
                arr = np.array(audio_data["array"], dtype=np.float32)
                orig_sr = audio_data.get("sampling_rate", 44100)
                t = (
                    torch.from_numpy(arr).unsqueeze(0)
                    if arr.ndim == 1
                    else torch.from_numpy(arr).t()
                )
                waveform = F.resample(t, orig_sr, demucs_sr)
                if waveform.shape[0] == 1:
                    waveform = waveform.repeat(2, 1)
                elif waveform.shape[0] > 2:
                    waveform = waveform[:2, :]
            else:
                return None
        elif isinstance(audio_data, bytes):
            waveform = FileSystemSource.read_bytes(
                audio_data, target_sr=demucs_sr, channels=2
            )
        else:
            return None

        if waveform is None:
            return None

        # -------------------------------------------------------------
        # 2. Demucs Features (waveform is already 44.1kHz stereo)
        # -------------------------------------------------------------
        wav_demucs = waveform.clone()

        # Demucs center crop: 30s
        chunk_size = 30 * demucs_sr
        duration = wav_demucs.shape[-1]
        if duration > chunk_size:
            start = (duration - chunk_size) // 2
            wav_demucs = wav_demucs[:, start : start + chunk_size]

        wav_demucs_input = wav_demucs.unsqueeze(0).to(demucs_extractor.device)

        with torch.no_grad():
            sources = apply_model(
                demucs_extractor.model, wav_demucs_input, shifts=0, split=True
            )[0]

        energies = (sources**2).mean(dim=(1, 2))
        drums_energy = float(energies[0])
        bass_energy = float(energies[1])
        other_energy = float(energies[2])
        vocals_energy = float(energies[3])
        total_energy = drums_energy + bass_energy + other_energy + vocals_energy + 1e-6

        demucs_feats = {
            "vocal_probability": vocals_energy / total_energy,
            "rhythm_ratio": (drums_energy + bass_energy) / total_energy,
            "bassiness": bass_energy / total_energy,
        }

        # -------------------------------------------------------------
        # 3. Torch Features (Resample from demucs_sr -> 22050Hz mono)
        # -------------------------------------------------------------
        torch_sr = torch_extractor.sample_rate
        wav_torch = F.resample(waveform, demucs_sr, torch_sr)

        # Mix down to mono
        if wav_torch.shape[0] > 1:
            wav_torch = torch.mean(wav_torch, dim=0, keepdim=True)

        # Torch center crop: 60s
        max_len = 60 * torch_sr
        duration_torch = wav_torch.shape[-1]
        if duration_torch > max_len:
            start = (duration_torch - max_len) // 2
            wav_torch = wav_torch[:, start : start + max_len]

        wav_torch = wav_torch.to(torch_extractor.device)

        centroid = F.spectral_centroid(
            wav_torch,
            sample_rate=torch_sr,
            pad=0,
            window=torch_extractor.window,
            n_fft=torch_extractor.n_fft,
            hop_length=torch_extractor.hop_length,
            win_length=torch_extractor.n_fft,
        )

        mfcc = torch_extractor.mfcc_transform(wav_torch)
        avg_mfcc = mfcc.mean(dim=2).squeeze().tolist()
        rms = torch.sqrt(torch.mean(wav_torch**2))

        torch_feats = {
            "brightness": float(centroid.mean().item()),
            "energy": float(rms.item()),
        }

        for idx, val in enumerate(avg_mfcc):
            torch_feats[f"mfcc_{idx}"] = float(val)

        return sanitize_dict(demucs_feats | torch_feats)

    except Exception as e:
        print(f"Extraction error: {e}")
        return None


def run():
    parquet_path = Path("datasets/cowen.parquet")
    output_csv = Path("datasets/cowen.csv")

    if not parquet_path.exists():
        print(f"❌ Could not find {parquet_path}")
        return

    print(f"📖 Reading {parquet_path}...")
    df = pd.read_parquet(parquet_path)
    print(f"Found {len(df)} audio entries.")

    torch_ext = get_torch_feature()
    demucs_ext = get_demucs_feature()

    results = []
    total = len(df)

    for i, row in df.iterrows():
        audio = row.get("audio")
        if audio is None:
            continue

        feats = extract_features_from_audio(audio, torch_ext, demucs_ext)
        if feats is None:
            continue

        # Keep metadata and emotion score columns (skip raw audio)
        clean_row = {k: v for k, v in row.items() if k != "audio"}
        clean_row.update(feats)
        results.append(clean_row)

        if (i + 1) % 25 == 0 or (i + 1) == total:
            print(f"Processed {i + 1}/{total} samples...", end="\r", flush=True)

    print("\n💾 Writing datasets/cowen.csv...")
    output_csv.parent.mkdir(parents=True, exist_ok=True)
    out_df = pd.DataFrame(results)
    out_df.to_csv(output_csv, index=False)
    print(
        f"✅ Extraction finished! Saved {len(out_df)} rows with {len(out_df.columns)} columns to {output_csv}"
    )


if __name__ == "__main__":
    run()
