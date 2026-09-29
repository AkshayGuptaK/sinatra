from pathlib import Path
from typing import List, Optional, Union
import numpy as np
import torch
import torchaudio.functional as F
from transformers import AutoProcessor, ClapModel

from src.sources import FileSystemSource


class ClapEmbedder:
    """Extracts 512-dim joint audio-text embeddings using LAION-CLAP

    (laion/larger_clap_music).
    """

    MODEL_ID = "laion/larger_clap_music"

    def __init__(self, device: Optional[str] = None):
        self.device = device or self._detect_device()
        self.target_sampling_rate = 48000  # CLAP requires 48kHz

        print(f"Loading CLAP ({self.MODEL_ID}) on {self.device}...")

        # Loads directly from ~/.cache/huggingface/hub/models--laion--larger_clap_music
        self.processor = AutoProcessor.from_pretrained(self.MODEL_ID)
        self.model = ClapModel.from_pretrained(self.MODEL_ID).to(self.device)
        self.model.eval()

    def _detect_device(self) -> str:
        if torch.backends.mps.is_available():
            print("ClapEmbedder: Using MPS")
            return "mps"
        elif torch.cuda.is_available():
            print("ClapEmbedder: Using CUDA")
            return "cuda"
        return "cpu"

    def extract(self, filepath: str) -> np.ndarray:
        """Extracts a 512-dimensional CLAP embedding from an audio file.

        Takes a central slice (up to 30-45 seconds) to prevent VRAM spikes.
        """
        # Read mono audio at 48kHz via FileSystemSource (FFmpeg)
        waveform = FileSystemSource.read_file(filepath, self.target_sampling_rate, 1)

        if hasattr(waveform, "numpy"):
            waveform = waveform.numpy()
        waveform = np.asarray(waveform).squeeze()

        # CLAP works with chunks up to ~10-30s; center crop to 30s max
        MAX_SAMPLES = 30 * self.target_sampling_rate  # 1,440,000 samples @ 48kHz
        total_samples = waveform.shape[0]
        if total_samples > MAX_SAMPLES:
            start = (total_samples - MAX_SAMPLES) // 2
            end = start + MAX_SAMPLES
            waveform = waveform[start:end]

        # Processor expects raw 1D float array and 48kHz sample rate
        inputs = self.processor(
            audio=waveform,
            sampling_rate=self.target_sampling_rate,
            return_tensors="pt",
        )

        input_features = inputs["input_features"].to(self.device)

        with torch.no_grad():
            audio_embeds = self.model.get_audio_features(input_features=input_features)
            # If get_audio_features returns BaseModelOutputWithPooling or a dict/tuple:
            if hasattr(audio_embeds, "pooler_output"):
                tensor = audio_embeds.pooler_output
            elif hasattr(audio_embeds, "last_hidden_state"):
                tensor = audio_embeds.last_hidden_state.mean(dim=1)
            elif isinstance(audio_embeds, torch.Tensor):
                tensor = audio_embeds
            else:
                tensor = audio_embeds[0]

            # Project through audio_projection if tensor is not already 512-dim
            if tensor.shape[-1] != 512 and hasattr(self.model, "audio_projection"):
                tensor = self.model.audio_projection(tensor)

            vector = tensor.squeeze().cpu().numpy().astype(np.float32)

        return vector

    def extract_text(self, text: Union[str, List[str]]) -> np.ndarray:
        """Extracts 512-dim embedding for natural language search queries."""
        texts = [text] if isinstance(text, str) else text
        inputs = self.processor(text=texts, return_tensors="pt", padding=True)
        input_ids = inputs["input_ids"].to(self.device)
        attention_mask = inputs["attention_mask"].to(self.device)

        with torch.no_grad():
            text_embeds = self.model.get_text_features(
                input_ids=input_ids, attention_mask=attention_mask
            )
            return text_embeds.cpu().numpy().astype(np.float32)


# Singleton helper
_clap_instance: Optional[ClapEmbedder] = None


def get_clap_embedder() -> ClapEmbedder:
    global _clap_instance
    if _clap_instance is None:
        _clap_instance = ClapEmbedder()
    return _clap_instance
