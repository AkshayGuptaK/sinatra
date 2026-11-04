from pathlib import Path
from typing import List, Optional, Union
import numpy as np
import torch
from transformers import AutoProcessor, ClapModel

from src.sources import FileSystemSource


class ClapEmbedder:
    """Extracts 512-dim joint audio-text embeddings using LAION-CLAP."""

    MODEL_ID = "laion/clap-htsat-unfused"

    def __init__(self, device: Optional[str] = None):
        self.device = device or self._detect_device()
        self.target_sampling_rate = 48000  # CLAP requires 48kHz

        print(f"Loading CLAP ({self.MODEL_ID}) on {self.device}...")

        # Prefer local cache; download once if missing
        try:
            self.processor = AutoProcessor.from_pretrained(
                self.MODEL_ID, local_files_only=True
            )
            self.model = ClapModel.from_pretrained(
                self.MODEL_ID, local_files_only=True
            ).to(self.device)
        except Exception:
            print(
                f"CLAP checkpoint miss in local cache. Downloading {self.MODEL_ID}..."
            )
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

    @staticmethod
    def _l2_normalize(vector: np.ndarray) -> np.ndarray:
        """Projects vector to unit length (norm = 1.0)."""
        norm = np.linalg.norm(vector, axis=-1, keepdims=True)
        return (vector / (norm + 1e-12)).astype(np.float32)

    def extract(self, filepath: str) -> np.ndarray:
        """Extracts a 512-dimensional CLAP embedding from an audio file.

        Takes a central slice (up to 30 seconds) to prevent VRAM spikes.
        """
        # Read mono audio at 48kHz via FileSystemSource (FFmpeg)
        waveform = FileSystemSource.read_file(filepath, self.target_sampling_rate, 1)

        if waveform is None:
            raise ValueError(f"Decoder returned None for {filepath}")

        if hasattr(waveform, "numpy"):
            waveform = waveform.numpy()
        waveform = np.asarray(waveform).squeeze()

        if waveform.size == 0:
            raise ValueError(f"Decoded audio has 0 samples: {filepath}")

        # CLAP works with chunks up to ~10-30s; center crop to 30s max
        MAX_SAMPLES = 30 * self.target_sampling_rate  # 1,440,000 samples @ 48kHz
        total_samples = waveform.shape[0]
        if total_samples > MAX_SAMPLES:
            start = (total_samples - MAX_SAMPLES) // 2
            end = start + MAX_SAMPLES
            waveform = waveform[start:end]

        inputs = self.processor(
            audio=waveform,
            sampling_rate=self.target_sampling_rate,
            return_tensors="pt",
        )

        model_inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            audio_embeds = self.model.get_audio_features(**model_inputs)

            if (
                hasattr(audio_embeds, "pooler_output")
                and audio_embeds.pooler_output is not None
            ):
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

            # L2 normalize in torch before moving to numpy
            tensor = tensor / (tensor.norm(dim=-1, keepdim=True) + 1e-12)
            vector = tensor.squeeze(0).cpu().numpy().astype(np.float32)

        return vector

    def extract_text(self, text: Union[str, List[str]]) -> np.ndarray:
        """Extracts 512-dim embedding for natural language search queries."""
        texts = [text] if isinstance(text, str) else text

        # FIX 3: Enforce truncation and max_length=77 for CLAP RoBERTa backbone
        inputs = self.processor(
            text=texts,
            padding=True,
            truncation=True,
            max_length=77,
            return_tensors="pt",
        )
        model_inputs = {k: v.to(self.device) for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model.get_text_features(**model_inputs)

            if hasattr(outputs, "pooler_output") and outputs.pooler_output is not None:
                embed = outputs.pooler_output
            elif hasattr(outputs, "last_hidden_state"):
                embed = outputs.last_hidden_state.mean(dim=1)
            elif isinstance(outputs, torch.Tensor):
                embed = outputs
            else:
                embed = outputs[0]

            if embed.shape[-1] != 512 and hasattr(self.model, "text_projection"):
                embed = self.model.text_projection(embed)

            # Unit normalize
            embed = embed / (embed.norm(dim=-1, keepdim=True) + 1e-12)
            vectors = embed.cpu().numpy().astype(np.float32)

        if isinstance(text, str):
            return vectors[0]
        return vectors


# Singleton helper
_clap_instance: Optional[ClapEmbedder] = None


def get_clap_embedder() -> ClapEmbedder:
    global _clap_instance
    if _clap_instance is None:
        _clap_instance = ClapEmbedder()
    return _clap_instance
