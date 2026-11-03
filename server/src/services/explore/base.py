from typing import Any, Iterator, Optional, Protocol
import torch


class MusicExplorer(Protocol):
    """Source-agnostic interface that any catalog explorer (YouTube, Spotify, etc.) implements."""

    def search(
        self,
        query: str,
        filter_type: Optional[str] = "songs",
        limit: int = 20,
        ignore_spelling: bool = False,
    ) -> list[dict[str, Any]]: ...

    def get_search_suggestions(
        self, query: str, detailed_runs: bool = False
    ) -> list[str] | list[dict[str, Any]]: ...

    def get_artist(self, artist_id: str) -> dict[str, Any]: ...

    def get_artist_albums(
        self, artist_id: str, params: str, limit: Optional[int] = 100
    ) -> list[dict[str, Any]]: ...

    def get_album(self, album_id: str) -> dict[str, Any]: ...

    def get_song_metadata(self, track_id: str) -> dict[str, Any]: ...

    def get_mood_categories(self) -> dict[str, list[dict[str, str]]]: ...

    def get_mood_playlists(self, params: str) -> list[dict[str, Any]]: ...

    def get_playlist(
        self, playlist_id: str, limit: Optional[int] = 100
    ) -> dict[str, Any]: ...

    def get_charts(self, country: str = "ZZ") -> dict[str, Any]: ...

    # --- Audio Streaming & Ingestion ---
    def get_stream_info(self, track_id: str, force_refresh: bool = False) -> Any: ...

    def read_stream(
        self, track_id: str, target_sr: int = 44100, channels: int = 2
    ) -> Optional[torch.Tensor]: ...

    def iter_audio_chunks(
        self,
        track_id: str,
        range_header: Optional[str] = None,
        chunk_size: int = 65536,
    ) -> tuple[Iterator[bytes], int, dict[str, str]]: ...
