from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional, List


@dataclass
class LyricsResult:
    text: str
    source: str
    is_synced: bool = False
    language: Optional[str] = None


class LyricsProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Unique provider identifier (e.g. 'syncedlyrics', 'genius', 'local')."""
        pass

    @abstractmethod
    def fetch(self, title: str, artist: str = "") -> Optional[LyricsResult]:
        """Fetches plain text lyrics for a song. Returns None if not found."""
        pass


class LyricsEmbedder(ABC):
    """Interface for all embedding models."""

    @abstractmethod
    def embed_documents(self, texts: List[str]) -> List[List[float]]:
        """Embed a list of strings."""
        pass

    @abstractmethod
    def embed_document(self, text: str) -> List[float]:
        """Embed a single text."""
        pass
