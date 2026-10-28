from abc import ABC, abstractmethod
from typing import Any, Union
import numpy as np


class AudioEmbedder(ABC):
    """Abstract base class for all acoustic audio embedding models."""

    @property
    @abstractmethod
    def model_id(self) -> str:
        """Identifier or Hugging Face path of the underlying model."""
        pass

    @property
    @abstractmethod
    def embedding_dim(self) -> int:
        """Output dimensionality of the embedding vector (e.g., 1024)."""
        pass

    @property
    @abstractmethod
    def target_sampling_rate(self) -> int:
        """Sample rate expected by the model processor (e.g., 24000)."""
        pass

    @abstractmethod
    def extract(self, chunks: list[Union[dict, Any]]) -> list[dict]:
        """Accepts a list of audio chunks (each containing a 'waveform' array),

        computes acoustic embeddings in a batched forward pass, and returns the
        chunks with an added 'acoustic_embedding' key (1D float32 numpy array).
        """
        pass
