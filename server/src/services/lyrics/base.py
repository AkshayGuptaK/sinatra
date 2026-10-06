from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Optional


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