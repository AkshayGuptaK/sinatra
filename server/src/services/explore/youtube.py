from dataclasses import asdict, dataclass
from typing import Any, Literal, Optional
import socket
import urllib3.util.connection as urllib3_conn
from ytmusicapi import YTMusic

# Force urllib3 (used by requests inside ytmusicapi) to resolve strictly via IPv4.
# Eliminates 60+ second OS TCP SYN hangs on broken IPv6 routes to Google CDNs.
urllib3_conn.allowed_gai_family = lambda: socket.AF_INET

SearchFilterType = Literal[
    "songs",
    "videos",
    "albums",
    "artists",
    "playlists",
    "community_playlists",
    "featured_playlists",
    "uploads",
]


# =============================================================================
# Data Transfer Objects (DTOs)
# =============================================================================
@dataclass
class RemoteTrack:
    video_id: str
    title: str
    artist: str
    artist_id: Optional[str] = None
    album: Optional[str] = None
    album_id: Optional[str] = None
    duration: Optional[int] = None
    thumbnail: Optional[str] = None
    is_explicit: bool = False
    lyrics_browse_id: Optional[str] = None
    source: str = "ytm"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RemoteAlbum:
    browse_id: str
    title: str
    artist: str
    artist_id: Optional[str] = None
    year: Optional[str] = None
    album_type: Optional[str] = None  # "Album", "Single", "EP"
    thumbnail: Optional[str] = None
    source: str = "ytm"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RemoteArtist:
    browse_id: str
    name: str
    subscribers: Optional[str] = None
    thumbnail: Optional[str] = None
    source: str = "ytm"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class RemotePlaylist:
    playlist_id: str
    title: str
    author: Optional[str] = None
    track_count: Optional[str] = None
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    source: str = "ytm"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# =============================================================================
# Core Explorer Service
# =============================================================================
class YoutubeExplorer:
    """Unauthenticated YouTube Music catalog explorer powered by ytmusicapi."""

    def __init__(self, language: str = "en"):
        self.yt = YTMusic(language=language)

    # -------------------------------------------------------------------------
    # Search & Suggestions
    # -------------------------------------------------------------------------
    def search(
        self,
        query: str,
        filter_type: Optional[SearchFilterType],
        limit: int = 20,
        ignore_spelling: bool = False,
    ) -> list[dict[str, Any]]:
        """Executes a filtered search (or unfiltered top results if filter_type=None)."""
        cleaned = query.strip()
        if not cleaned:
            return []

        print(query, filter_type, limit)

        raw_results = self.yt.search(
            query=cleaned,
            filter=filter_type,
            limit=limit,
            ignore_spelling=ignore_spelling,
        )

        print("res", raw_results)

        items: list[dict[str, Any]] = []
        for item in raw_results:
            parsed = self._normalize_search_item(item)
            if parsed:
                items.append(parsed)

        return items

    def get_search_suggestions(
        self, query: str, detailed_runs: bool = False
    ) -> list[str] | list[dict[str, Any]]:
        """Returns autocomplete search query predictions."""
        cleaned = query.strip()
        if not cleaned:
            return []
        try:
            return self.yt.get_search_suggestions(
                query=cleaned, detailed_runs=detailed_runs
            )
        except Exception:
            return []

    # -------------------------------------------------------------------------
    # Artist Information & Releases (Songs, Albums, Singles, Related)
    # -------------------------------------------------------------------------
    def get_artist(self, channel_id: str) -> dict[str, Any]:
        """Fetches artist overview, top songs, albums, singles, and related artists."""
        data = self.yt.get_artist(channel_id)

        songs_section = data.get("songs", {})
        albums_section = data.get("albums", {})
        singles_section = data.get("singles", {})
        related_section = data.get("related", {})

        top_songs = [
            self._parse_track(t).to_dict()
            for t in songs_section.get("results", [])
            if t.get("videoId")
        ]

        albums = [
            self._parse_album_summary(a, fallback_artist=data.get("name", "")).to_dict()
            for a in albums_section.get("results", [])
            if a.get("browseId")
        ]

        singles = [
            self._parse_album_summary(
                s, fallback_artist=data.get("name", ""), default_type="Single"
            ).to_dict()
            for s in singles_section.get("results", [])
            if s.get("browseId")
        ]

        related_artists = [
            RemoteArtist(
                browse_id=r["browseId"],
                name=r.get("title", "Unknown Artist"),
                subscribers=r.get("subscribers"),
                thumbnail=self._best_thumbnail(r.get("thumbnails")),
            ).to_dict()
            for r in related_section.get("results", [])
            if r.get("browseId")
        ]

        return {
            "browse_id": channel_id,
            "name": data.get("name", "Unknown Artist"),
            "description": data.get("description"),
            "views": data.get("views"),
            "subscribers": data.get("subscribers"),
            "thumbnail": self._best_thumbnail(data.get("thumbnails")),
            "songs_playlist_id": songs_section.get("browseId"),
            "songs": top_songs,
            "albums": {
                "items": albums,
                "browse_id": albums_section.get("browseId"),
                "params": albums_section.get("params"),
            },
            "singles": {
                "items": singles,
                "browse_id": singles_section.get("browseId"),
                "params": singles_section.get("params"),
            },
            "related_artists": related_artists,
        }

    def get_artist_albums(
        self,
        channel_id: str,
        params: str,
        limit: Optional[int] = 100,
    ) -> list[dict[str, Any]]:
        """Fetches the full list of an artist's albums or singles when 'See All' is clicked."""
        raw_albums = self.yt.get_artist_albums(
            channelId=channel_id, params=params, limit=limit
        )
        return [
            self._parse_album_summary(a).to_dict()
            for a in raw_albums
            if a.get("browseId")
        ]

    # -------------------------------------------------------------------------
    # Albums
    # -------------------------------------------------------------------------
    def get_album(self, browse_id: str) -> dict[str, Any]:
        """Fetches album metadata and its complete ordered tracklist."""
        data = self.yt.get_album(browse_id)

        album_title = data.get("title", "Unknown Album")
        artist_name, artist_id = self._extract_primary_artist(data.get("artists"))
        thumbnail = self._best_thumbnail(data.get("thumbnails"))

        tracks: list[dict[str, Any]] = []
        for t in data.get("tracks", []):
            track = self._parse_track(
                t,
                fallback_artist=artist_name,
                fallback_artist_id=artist_id,
                fallback_album=album_title,
                fallback_album_id=browse_id,
                fallback_thumbnail=thumbnail,
            )
            if track.video_id:
                tracks.append(track.to_dict())

        return {
            "browse_id": browse_id,
            "audio_playlist_id": data.get("audioPlaylistId"),
            "title": album_title,
            "artist": artist_name,
            "artist_id": artist_id,
            "year": data.get("year"),
            "album_type": data.get("type"),
            "description": data.get("description"),
            "track_count": data.get("trackCount"),
            "duration_seconds": data.get("duration_seconds"),
            "thumbnail": thumbnail,
            "tracks": tracks,
        }

    # -------------------------------------------------------------------------
    # Song Metadata
    # -------------------------------------------------------------------------
    def get_song_metadata(self, video_id: str) -> dict[str, Any]:
        """Fetches rich track metadata (including album, artist IDs, and lyrics browse ID).
        Uses get_watch_playlist for rich YTM relational metadata, falling back to get_song.
        """
        watch = self.yt.get_watch_playlist(videoId=video_id, limit=1)
        watch_tracks = watch.get("tracks", [])
        lyrics_browse_id = watch.get("lyrics")

        if watch_tracks:
            track = self._parse_track(watch_tracks[0])
            track.lyrics_browse_id = lyrics_browse_id
            return track.to_dict()

        # Fallback to /player videoDetails if watch playlist is unavailable
        raw_song = self.yt.get_song(video_id)
        details = raw_song.get("videoDetails", {})
        duration_str = details.get("lengthSeconds")

        return RemoteTrack(
            video_id=video_id,
            title=details.get("title", "Unknown Title"),
            artist=details.get("author", "Unknown Artist"),
            artist_id=details.get("channelId"),
            duration=(
                int(duration_str)
                if duration_str and str(duration_str).isdigit()
                else None
            ),
            thumbnail=self._best_thumbnail(
                details.get("thumbnail", {}).get("thumbnails")
            ),
            lyrics_browse_id=lyrics_browse_id,
        ).to_dict()

    # -------------------------------------------------------------------------
    # Exploring Music: Moods & Genres + Playlists
    # -------------------------------------------------------------------------
    def get_mood_categories(self) -> dict[str, list[dict[str, str]]]:
        """Returns mood & genre sections (e.g., 'Moods & moments', 'Genres')
        where each item has { 'title': str, 'params': str }.
        """
        return self.yt.get_mood_categories()

    def get_mood_playlists(self, params: str) -> list[dict[str, Any]]:
        """Returns curated playlists for a given mood/genre 'params' token."""
        raw_playlists = self.yt.get_mood_playlists(params)
        return [
            self._parse_playlist_summary(p).to_dict()
            for p in raw_playlists
            if p.get("playlistId")
        ]

    def get_playlist(
        self, playlist_id: str, limit: Optional[int] = 100
    ) -> dict[str, Any]:
        """Resolves a playlist into its metadata and full list of playable tracks."""
        if playlist_id.startswith("VL"):
            playlist_id = playlist_id[2:]

        data = self.yt.get_playlist(playlistId=playlist_id, limit=limit)
        author_name, _ = self._extract_primary_artist(data.get("author"))

        tracks = [
            self._parse_track(t).to_dict()
            for t in data.get("tracks", [])
            if t.get("videoId")
        ]

        return {
            "playlist_id": data.get("id", playlist_id),
            "title": data.get("title", "Untitled Playlist"),
            "author": author_name,
            "description": data.get("description"),
            "track_count": data.get("trackCount"),
            "year": data.get("year"),
            "duration_seconds": data.get("duration_seconds"),
            "thumbnail": self._best_thumbnail(data.get("thumbnails")),
            "tracks": tracks,
        }

    # -------------------------------------------------------------------------
    # Exploring Music: Latest Charts (Global & Per-Country)
    # -------------------------------------------------------------------------
    def get_charts(self, country: str = "ZZ") -> dict[str, Any]:
        """Fetches latest charts for a country (ISO 3166-1 Alpha-2, e.g. 'US', 'IN', 'GB',
        or 'ZZ' for Global).
        """
        data = self.yt.get_charts(country=country.upper())

        videos: list[dict[str, Any]] = [
            {"title": item.get("title"), "id": item.get("playlistId")}
            for item in data.get("videos", [])
        ]

        artists: list[dict[str, Any]] = [
            {"title": item.get("title"), "id": item.get("browseId")}
            for item in data.get("artists", [])
        ]

        return {
            "country": country.upper(),
            "countries": data.get("countries", {}).get("options", []),
            "videos": videos,
            "artists": artists,
        }

    # =========================================================================
    # Internal Normalization Helpers
    # =========================================================================
    def _normalize_search_item(self, item: dict[str, Any]) -> Optional[dict[str, Any]]:
        result_type = item.get("resultType")

        if result_type in ("song", "video"):
            if not item.get("videoId"):
                return None
            parsed = self._parse_track(item).to_dict()
            parsed["result_type"] = result_type
            return parsed

        if result_type == "album":
            if not item.get("browseId"):
                return None
            parsed = self._parse_album_summary(item).to_dict()
            parsed["result_type"] = "album"
            return parsed

        if result_type == "artist":
            browse_id = item.get("browseId")
            if not browse_id:
                return None
            artist_name = item.get("artist") or item.get("title") or "Unknown Artist"
            parsed = RemoteArtist(
                browse_id=browse_id,
                name=artist_name,
                subscribers=item.get("subscribers"),
                thumbnail=self._best_thumbnail(item.get("thumbnails")),
            ).to_dict()
            parsed["result_type"] = "artist"
            return parsed

        if result_type == "playlist":
            browse_id = item.get("browseId") or item.get("playlistId")
            if not browse_id:
                return None
            playlist_id = browse_id[2:] if browse_id.startswith("VL") else browse_id
            parsed = RemotePlaylist(
                playlist_id=playlist_id,
                title=item.get("title", "Untitled Playlist"),
                author=item.get("author"),
                track_count=str(item.get("itemCount", "")) or None,
                thumbnail=self._best_thumbnail(item.get("thumbnails")),
            ).to_dict()
            parsed["result_type"] = "playlist"
            return parsed

        return None

    def _parse_track(
        self,
        item: dict[str, Any],
        fallback_artist: str = "Unknown Artist",
        fallback_artist_id: Optional[str] = None,
        fallback_album: Optional[str] = None,
        fallback_album_id: Optional[str] = None,
        fallback_thumbnail: Optional[str] = None,
    ) -> RemoteTrack:
        artist_name, artist_id = self._extract_primary_artist(
            item.get("artists"), fallback_name=fallback_artist
        )
        if not artist_id:
            artist_id = fallback_artist_id

        album_node = item.get("album")
        album_name = fallback_album
        album_id = fallback_album_id
        if isinstance(album_node, dict):
            album_name = album_node.get("name") or fallback_album
            album_id = album_node.get("id") or fallback_album_id
        elif isinstance(album_node, str):
            album_name = album_node

        duration = item.get("duration_seconds")
        if duration is None:
            duration = self._parse_duration_str(
                item.get("duration") or item.get("length")
            )

        thumbnail = (
            self._best_thumbnail(item.get("thumbnails") or item.get("thumbnail"))
            or fallback_thumbnail
        )

        return RemoteTrack(
            video_id=item.get("videoId", ""),
            title=item.get("title", "Unknown Title"),
            artist=artist_name,
            artist_id=artist_id,
            album=album_name,
            album_id=album_id,
            duration=duration,
            thumbnail=thumbnail,
            is_explicit=bool(item.get("isExplicit", False)),
        )

    def _parse_album_summary(
        self,
        item: dict[str, Any],
        fallback_artist: str = "Unknown Artist",
        default_type: Optional[str] = None,
    ) -> RemoteAlbum:
        artist_name, artist_id = self._extract_primary_artist(
            item.get("artists"), fallback_name=fallback_artist
        )
        return RemoteAlbum(
            browse_id=item.get("browseId", ""),
            title=item.get("title", "Unknown Album"),
            artist=artist_name,
            artist_id=artist_id,
            year=item.get("year"),
            album_type=item.get("type") or default_type,
            thumbnail=self._best_thumbnail(item.get("thumbnails")),
        )

    def _parse_playlist_summary(self, item: dict[str, Any]) -> RemotePlaylist:
        pid = item.get("playlistId", "")
        if pid.startswith("VL"):
            pid = pid[2:]
        return RemotePlaylist(
            playlist_id=pid,
            title=item.get("title", "Untitled Playlist"),
            author=item.get("author"),
            description=item.get("description"),
            track_count=str(item.get("count", "")) or None,
            thumbnail=self._best_thumbnail(item.get("thumbnails")),
        )

    @staticmethod
    def _extract_primary_artist(
        artists_node: Any, fallback_name: str = "Unknown Artist"
    ) -> tuple[str, Optional[str]]:
        if isinstance(artists_node, list) and artists_node:
            names = [
                a.get("name", "")
                for a in artists_node
                if isinstance(a, dict) and a.get("name")
            ]
            primary_id = next(
                (
                    a.get("id")
                    for a in artists_node
                    if isinstance(a, dict) and a.get("id")
                ),
                None,
            )
            return (", ".join(names) if names else fallback_name), primary_id
        if isinstance(artists_node, dict):
            return artists_node.get("name", fallback_name), artists_node.get("id")
        if isinstance(artists_node, str) and artists_node.strip():
            return artists_node.strip(), None
        return fallback_name, None

    @staticmethod
    def _best_thumbnail(thumbnails: Any) -> Optional[str]:
        if isinstance(thumbnails, list) and thumbnails:
            return thumbnails[-1].get("url")
        if isinstance(thumbnails, dict):
            thumbs = thumbnails.get("thumbnails")
            if isinstance(thumbs, list) and thumbs:
                return thumbs[-1].get("url")
        return None

    @staticmethod
    def _parse_duration_str(val: Optional[str]) -> Optional[int]:
        if not val or ":" not in val:
            return None
        parts = val.strip().split(":")
        if not all(p.isdigit() for p in parts):
            return None
        nums = [int(p) for p in parts]
        if len(nums) == 2:
            return nums[0] * 60 + nums[1]
        if len(nums) == 3:
            return nums[0] * 3600 + nums[1] * 60 + nums[2]
        return None


_youtube_explorer_instance: Optional[YoutubeExplorer] = None


def get_youtube_explorer() -> YoutubeExplorer:
    global _youtube_explorer_instance
    if _youtube_explorer_instance is None:
        _youtube_explorer_instance = YoutubeExplorer()
    return _youtube_explorer_instance
