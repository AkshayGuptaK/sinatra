from typing import Any, Optional, Union
import numpy as np
import torch
from transformers import AutoModel, Wav2Vec2FeatureExtractor

from src.models.base import BaseAudioEmbedder


class MertEmbedder(BaseAudioEmbedder):
    MODEL_ID = "m-a-p/MERT-v2-30s"
    EMBEDDING_DIM = 1024
    TARGET_SAMPLING_RATE = 24000

    def __init__(self, model_id: Optional[str] = None):
        self._model_id = model_id or self.MODEL_ID
        self.device = self._resolve_device()

        print(f"🚀 Loading {self._model_id} on {self.device}...", flush=True)
        self.processor = Wav2Vec2FeatureExtractor.from_pretrained(
            self._model_id, trust_remote_code=True
        )
        self.model = AutoModel.from_pretrained(
            self._model_id, trust_remote_code=True
        ).to(self.device)
        self.model.eval()

    @property
    def model_id(self) -> str:
        return self._model_id

    @property
    def embedding_dim(self) -> int:
        return self.EMBEDDING_DIM

    @property
    def target_sampling_rate(self) -> int:
        return self.TARGET_SAMPLING_RATE

    def _resolve_device(self) -> str:
        if torch.backends.mps.is_available():
            print("MertEmbedder: Using MPS (Apple Silicon)")
            return "mps"
        elif torch.cuda.is_available():
            print("MertEmbedder: Using CUDA")
            return "cuda"
        else:
            print("MertEmbedder: Using CPU")
            return "cpu"

    def extract(self, chunks: list[Union[dict, Any]]) -> list[dict]:
        """Extracts MERT embeddings for all chunks in a single batched forward pass.

        Args:
            chunks: List of dictionaries or AudioChunk dataclasses.
                    Each item must have a 'waveform' field (1D float32 numpy array).

        Returns:
            List of dictionaries containing all original chunk metadata plus:
            'acoustic_embedding': 1D float32 numpy array of shape (1024,)
        """
        if not chunks:
            return []

        # 1. Standardize chunks to dictionaries and extract waveforms
        standardized_chunks: list[dict] = []
        raw_waveforms: list[np.ndarray] = []

        for c in chunks:
            if isinstance(c, dict):
                c_dict = dict(c)
            elif hasattr(c, "__dict__"):
                c_dict = dict(c.__dict__)
            else:
                raise ValueError(
                    f"Unsupported chunk type {type(c)}. Expected dict or dataclass."
                )

            wave = c_dict.get("waveform")
            if wave is None:
                raise ValueError("Chunk missing required 'waveform' array.")

            if hasattr(wave, "numpy"):
                wave = wave.numpy()
            wave = np.asarray(wave, dtype=np.float32).squeeze()

            if wave.ndim != 1:
                raise ValueError(f"Expected 1D waveform, got shape {wave.shape}")

            standardized_chunks.append(c_dict)
            raw_waveforms.append(wave)

        # 2. Batch Tokenization / Preprocessing
        inputs = self.processor(
            raw_waveforms,
            sampling_rate=self.target_sampling_rate,
            return_tensors="pt",
            padding=True,
        )
        input_values = inputs.input_values.to(self.device)

        # 3. Batched Model Inference
        with torch.no_grad():
            outputs = self.model(input_values=input_values, output_hidden_states=True)

        # outputs.hidden_states[-1] shape: (Batch_Size, Time_Frames, 1024)
        last_hidden = outputs.hidden_states[-1]

        # 4. Temporal Mean Pooling per Chunk
        # (Batch_Size, Time_Frames, 1024) -> (Batch_Size, 1024)
        embeddings = last_hidden.mean(dim=1).cpu().numpy().astype(np.float32)

        # 5. Attach embedding to each chunk dictionary
        for idx, chunk_dict in enumerate(standardized_chunks):
            chunk_dict["acoustic_embedding"] = embeddings[idx]

        return standardized_chunks


_mert_instance: Optional[MertEmbedder] = None


def get_mert_embedder() -> MertEmbedder:
    """Returns the singleton MertEmbedder instance."""
    global _mert_instance
    if _mert_instance is None:
        _mert_instance = MertEmbedder()
    return _mert_instance
