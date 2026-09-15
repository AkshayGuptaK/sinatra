import os
from pathlib import Path
import numpy as np
import torch
import torchaudio.functional as F
from transformers import Wav2Vec2FeatureExtractor, AutoModel
from src.sources import *


class MusicalEmbedder:
    def __init__(self):
        self.device = None
        self._set_device()
        self.target_sampling_rate = 24000

        current_file = Path(__file__).resolve()
        project_root = current_file.parents[1]
        model_dir = project_root / "src" / "models" / "mert"

        print(f"Loading MERT from local path: {model_dir}...")

        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(
            model_dir, local_files_only=True, trust_remote_code=True
        )

        self.model = AutoModel.from_pretrained(
            model_dir, local_files_only=True, trust_remote_code=True
        ).to(self.device)

    def _set_device(self):
        if torch.backends.mps.is_available():
            self.device = "mps"
            print("FeatureExtractor: Using MPS")
        elif torch.cuda.is_available():
            self.device = "cuda"
        else:
            self.device = "cpu"
            print("FeatureExtractor: Using CPU")

    def extract(self, filepath):
        print(f"Starting embedding of {filepath}")
        waveform = FileSystemSource.read_file(filepath, self.target_sampling_rate, 1)

        if hasattr(waveform, "numpy"):
            waveform = waveform.numpy()
        waveform = np.asarray(waveform).squeeze()

        MAX_SAMPLES = 1_440_000

        total_samples = waveform.shape[0]
        if total_samples > MAX_SAMPLES:
            start = (total_samples - MAX_SAMPLES) // 2
            end = start + MAX_SAMPLES
            waveform = waveform[start:end]

        inputs = self.processor(
            waveform,
            sampling_rate=self.target_sampling_rate,
            return_tensors="pt",
            padding=True,
        )

        input_values = inputs.input_values.to(self.device)

        with torch.no_grad():
            outputs = self.model(input_values=input_values, output_hidden_states=True)

        # Take the average of the last hidden state for the "song embedding"
        # (Advanced: Weighted average of layers is better for MERT, but last layer is fine for start)
        musical_vector = outputs.hidden_states[-1].mean(dim=1).cpu().numpy().flatten()

        print(f"Completed embedding of {filepath}")
        return musical_vector


_embedder_instance = None


def get_musical_embedder():
    global _embedder_instance

    if _embedder_instance is None:
        _embedder_instance = MusicalEmbedder()

    return _embedder_instance
