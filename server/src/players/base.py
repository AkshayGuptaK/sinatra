from abc import ABC, abstractmethod
from typing import List, Optional, TypedDict

class PlayerStatus(TypedDict):
    state: str  # play, stop, or pause
    volume: int
    elapsed: float
    bitrate: Optional[int]

class SongMetadata(TypedDict):
    id: str
    title: str
    artist: str
    album: str
    duration: int

class MusicPlayer(ABC):
    @abstractmethod
    def play(self, filepaths: List[str]) -> None:
        """Clear queue and play these files immediately."""
        ...

    @abstractmethod
    def enqueue(self, filepaths: List[str]) -> None:
        """Add these files to the end of the current queue."""
        ...

    @abstractmethod
    def get_status(self) -> PlayerStatus:
        """Return the current state of the player."""
        ...

    # @abstractmethod
    # def stop(self) -> None: ...

    # @abstractmethod
    # def get_current_song(self) -> Optional[SongMetadata]: ...