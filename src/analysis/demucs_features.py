import torch
import numpy as np
from demucs.pretrained import get_model
from demucs.apply import apply_model
from src.sources import *


class DemucsFeatureExtractor:
    def __init__(self, device=None):
        if device is None:
            self.device = "mps" if torch.backends.mps.is_available() else "cpu"
        else:
            self.device = device

        print(f"Loading Demucs on {self.device}...")

        # 2. Load the Model
        # "htdemucs" is the latest Hybrid Transformer model (Fast & Accurate)
        self.model = get_model(name="htdemucs").to(self.device)
        self.model.eval()
        self.model_sr = 44100  # Demucs usually expects this

    def extract(self, filepath: str):
        try:
            waveform = FileSystemSource.read_file(filepath, self.model_sr, 2)

            if waveform is None:
                return None

            duration = waveform.shape[-1]
            chunk_size = 30 * self.model_sr

            if duration > chunk_size:
                start = (duration - chunk_size) // 2
                waveform = waveform[:, start : start + chunk_size]

            # Add batch dimension: (1, channels, time)
            wav = waveform.unsqueeze(0)

            # 3. Run Separation
            # shifts=0 disables random shifts (faster)
            # split=True allows handling long segments if you didn't crop
            with torch.no_grad():
                sources = apply_model(self.model, wav, shifts=0, split=True)[0]
                # sources shape: (4, channels, time)
                # Indices: 0=Drums, 1=Bass, 2=Other, 3=Vocals

            # 4. Calculate Energy
            # We square the waveform to get power, then mean
            energies = (sources**2).mean(dim=(1, 2))  # Shape: (4,)

            drums_energy = float(energies[0])
            bass_energy = float(energies[1])
            other_energy = float(energies[2])
            vocals_energy = float(energies[3])

            total_energy = (
                drums_energy + bass_energy + other_energy + vocals_energy + 1e-6
            )

            # 5. The Metrics
            vocal_ratio = vocals_energy / total_energy

            # "Intensiveness" proxy (Drums + Bass ratio)
            rhythm_ratio = (drums_energy + bass_energy) / total_energy

            return {
                "vocal_probability": vocal_ratio,  # The Holy Grail for Pineapple vs Starfruit
                "rhythm_ratio": rhythm_ratio,  # Good for Chill vs Upbeat
                "bassiness": bass_energy / total_energy,
            }

        except Exception as e:
            print(f"Demucs error {filepath}: {e}")
            return None


_demucs_feature_instance = None


def get_demucs_feature():
    global _demucs_feature_instance

    if _demucs_feature_instance is None:
        _demucs_feature_instance = DemucsFeatureExtractor()

    return _demucs_feature_instance
