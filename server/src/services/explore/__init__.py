from typing import Callable
from src.services.explore.base import MusicExplorer
from src.services.explore.youtube import (
    RemoteAlbum,
    RemoteArtist,
    RemotePlaylist,
    RemoteTrack,
    SearchFilterType,
    YoutubeExplorer,
    get_youtube_explorer,
)

# Registry mapping source identifiers ('ytm', 'youtube', and future 'spotify', etc.) to their factory
_EXPLORER_FACTORIES: dict[str, Callable[[], MusicExplorer]] = {
    "ytm": get_youtube_explorer,
    "youtube": get_youtube_explorer,
}


def get_explorer(source: str) -> MusicExplorer:
    """Resolves a source key into its corresponding MusicExplorer instance."""
    key = source.strip().lower()
    factory = _EXPLORER_FACTORIES.get(key)
    if not factory:
        supported = ", ".join(sorted(_EXPLORER_FACTORIES.keys()))
        raise ValueError(
            f"Unsupported explore source '{source}'. Supported sources: {supported}"
        )
    return factory()


def get_supported_sources() -> list[str]:
    return sorted(set(_EXPLORER_FACTORIES.keys()))


__all__ = [
    "MusicExplorer",
    "RemoteAlbum",
    "RemoteArtist",
    "RemotePlaylist",
    "RemoteTrack",
    "SearchFilterType",
    "YoutubeExplorer",
    "get_explorer",
    "get_supported_sources",
    "get_youtube_explorer",
]
