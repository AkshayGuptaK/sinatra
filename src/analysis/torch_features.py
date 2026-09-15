import torch
import torchaudio
import torchaudio.transforms as T
import torchaudio.functional as F
import numpy as np
from src.sources import *


class TorchFeatureExtractor:
    def __init__(self, device="cpu"):
        self.device = device
        self.sample_rate = 22050

        self.n_fft = 4096
        self.hop_length = 1024
        self.n_mels = 80  # Reduced from 128 to 80 (Standard for music analysis)

        # Pre-define transforms
        self.spec_transform = T.Spectrogram(
            n_fft=self.n_fft, hop_length=self.hop_length, power=2.0
        )

        self.mfcc_transform = T.MFCC(
            sample_rate=self.sample_rate,
            n_mfcc=13,
            melkwargs={
                "n_fft": self.n_fft,
                "n_mels": self.n_mels,
                "hop_length": self.hop_length,
                "mel_scale": "htk",  # Better for music than 'slaney' default
            },
        )

        # Pre-calculate window for centroid (optimization)
        self.window = torch.hann_window(self.n_fft).to(self.device)

    def extract(self, filepath: str):
        try:
            waveform = FileSystemSource.read_file(filepath, self.sample_rate, 1)

            if waveform is None:
                return None
            # Crop to 60s
            max_len = 60 * self.sample_rate
            duration = waveform.shape[-1]

            if duration > max_len:
                start = (duration - max_len) // 2
                waveform = waveform[:, start : start + max_len]

            # 2. Spectral Centroid (Brightness)
            centroid = F.spectral_centroid(
                waveform,
                sample_rate=self.sample_rate,
                pad=0,
                window=self.window,
                n_fft=self.n_fft,
                hop_length=self.hop_length,
                win_length=self.n_fft,
            )
            avg_brightness = float(centroid.mean())

            # 3. MFCC (Timbre)
            mfcc = self.mfcc_transform(waveform)
            avg_mfcc = mfcc.mean(dim=2).squeeze().tolist()  # Average over time

            # 5. RMS Energy (Volume/Intensity)
            rms = torch.sqrt(torch.mean(waveform**2))

            return {
                "brightness": avg_brightness,  # Hz
                "energy": float(rms),  # Volume
                "mfcc_mean": avg_mfcc,  # Timbre Vector
            }

        except Exception as e:
            print(f"Feature error {filepath}: {e}")
            return None


_torch_feature_instance = None


def get_torch_feature():
    global _torch_feature_instance

    if _torch_feature_instance is None:
        _torch_feature_instance = TorchFeatureExtractor()

    return _torch_feature_instance
