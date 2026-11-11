import re
import requests
import shutil
import socket
import subprocess
import tempfile
import threading
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Literal, Optional, Iterator
from pathlib import Path
import urllib3.util.connection as urllib3_conn
import urllib.request
import numpy as np
import torch
from ytmusicapi import YTMusic
import yt_dlp

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


@dataclass
class AudioStreamInfo:
    video_id: str
    stream_url: str
    ext: str
    acodec: str
    abr: Optional[float]
    duration: Optional[int]
    http_headers: dict[str, str] = field(default_factory=dict)
    expires_at: float = 0.0
    title: Optional[str] = None
    artist: Optional[str] = None


# =============================================================================
# Core Explorer Service
# =============================================================================
class YoutubeExplorer:
    """Unauthenticated YouTube Music catalog explorer."""

    STREAM_CACHE_TTL_SEC = 3.5 * 3600
    _stream_cache: dict[str, AudioStreamInfo] = {}
    _stream_locks: dict[str, threading.Lock] = {}
    _lock_guard = threading.Lock()
    _http_session: Optional[requests.Session] = None

    def __init__(self, language: str = "en"):
        self.yt = YTMusic(language=language)

    @classmethod
    def _get_http_session(cls) -> requests.Session:
        if cls._http_session is None:
            cls._http_session = requests.Session()
            adapter = requests.adapters.HTTPAdapter(
                pool_connections=10, pool_maxsize=20
            )
            cls._http_session.mount("https://", adapter)
            cls._http_session.mount("http://", adapter)
        return cls._http_session

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

        raw_results = self.yt.search(
            query=cleaned,
            filter=filter_type,
            limit=limit,
            ignore_spelling=ignore_spelling,
        )

        results = [
            normalized
            for item in raw_results
            if (normalized := self._normalize_search_item(item)) is not None
        ]

        return results[:limit]

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
    # Song Recommendations
    # -------------------------------------------------------------------------
    def get_song_recommendations(self, video_id: str, limit: int) -> dict[str, Any]:
        """Fetches related tracks."""
        watch = self.yt.get_watch_playlist(videoId=video_id, limit=limit + 1)
        return [self._parse_track(t).to_dict() for t in watch.get("tracks", [])]

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

    # -------------------------------------------------------------------------
    #  Music Playback and Download
    # -------------------------------------------------------------------------

    @staticmethod
    def _build_ffmpeg_network_args(http_headers: dict[str, str]) -> list[str]:
        """Builds resilient network reconnect and CDN authentication flags for FFmpeg."""
        args = [
            "-reconnect",
            "1",
            "-reconnect_streamed",
            "1",
            "-reconnect_delay_max",
            "5",
        ]
        if http_headers:
            header_str = "".join(f"{k}: {v}\r\n" for k, v in http_headers.items())
            args.extend(["-headers", header_str])
        return args

    @staticmethod
    def _sanitize_filename(name: str) -> str:
        """Removes illegal filesystem characters from titles/artists."""
        return re.sub(r'[\\/*?:"<>|]', "", name).strip()

    @staticmethod
    def _resolve_unique_path(destination_dir: Path, filename: str) -> Path:
        """Resolves collisions by appending incrementing counter suffixes."""
        target = destination_dir / filename
        stem = target.stem
        suffix = target.suffix
        counter = 1
        while target.exists():
            target = destination_dir / f"{stem} ({counter}){suffix}"
            counter += 1
        return target

    # -------------------------------------------------------------------------
    # Stream Resolution & Caching
    # -------------------------------------------------------------------------
    @classmethod
    def get_stream_info(
        cls, video_id: str, force_refresh: bool = False
    ) -> AudioStreamInfo:
        """Extracts direct audio-only stream URL, headers, and metadata using yt-dlp."""
        now = time.time()
        cached = cls._stream_cache.get(video_id)
        if cached and not force_refresh and cached.expires_at > now:
            return cached

        # Per-video lock prevents parallel range requests from spawning multiple yt-dlp runs
        with cls._lock_guard:
            if video_id not in cls._stream_locks:
                cls._stream_locks[video_id] = threading.Lock()
            video_lock = cls._stream_locks[video_id]

        with video_lock:
            now = time.time()
            cached = cls._stream_cache.get(video_id)
            if cached and not force_refresh and cached.expires_at > now:
                return cached

            url = f"https://music.youtube.com/watch?v={video_id}"
            ydl_opts = {
                # Prefer WebM/Opus first: its header cues are at byte 0 (instant streaming)
                "format": "bestaudio[ext=webm][acodec=opus]/bestaudio[acodec=opus]/bestaudio",
                "quiet": True,
                "no_warnings": True,
                "noplaylist": True,
                "extract_flat": False,
            }

            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            stream_info = AudioStreamInfo(
                video_id=video_id,
                stream_url=info["url"],
                ext=info.get("ext", "webm"),
                acodec=info.get("acodec", "opus"),
                abr=info.get("abr"),
                duration=info.get("duration"),
                http_headers=info.get("http_headers", {}),
                expires_at=now + cls.STREAM_CACHE_TTL_SEC,
                title=info.get("title") or info.get("track"),
                artist=info.get("artist")
                or info.get("uploader")
                or info.get("creator"),
            )
            cls._stream_cache[video_id] = stream_info
            return stream_info

    # -------------------------------------------------------------------------
    # In-Memory Stream Ingestion (PyTorch Tensor)
    # -------------------------------------------------------------------------
    @classmethod
    def read_stream(
        cls, video_id: str, target_sr: int = 44100, channels: int = 2
    ) -> Optional[torch.Tensor]:
        """Streams and decodes audio into a PyTorch Float32 tensor matching read_file."""
        try:
            stream_info = cls.get_stream_info(video_id)

            cmd = [
                "ffmpeg",
                "-v",
                "error",
                *cls._build_ffmpeg_network_args(stream_info.http_headers),
                "-i",
                stream_info.stream_url,
                "-vn",
                "-f",
                "f32le",
                "-ac",
                str(channels),
                "-ar",
                str(target_sr),
                "-",
            ]

            process = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            stdout, stderr = process.communicate()

            if process.returncode != 0 or len(stdout) == 0:
                print(f"FFmpeg stream decode failed for {video_id}: {stderr.decode()}")
                return None

            audio_np = np.frombuffer(stdout, dtype=np.float32).copy()
            if channels > 1:
                audio_np = audio_np.reshape(-1, channels).T
            else:
                audio_np = audio_np.reshape(1, -1)

            return torch.from_numpy(audio_np)

        except Exception as e:
            print(f"YouTube Stream Load Error ({video_id}): {e}")
            return None

    # -------------------------------------------------------------------------
    # HTTP Byte Streaming (FastAPI / HTML5 Audio)
    # -------------------------------------------------------------------------
    @classmethod
    def iter_audio_chunks(
        cls,
        video_id: str,
        range_header: Optional[str] = None,
        chunk_size: int = 32768,  # 32KB chunks for faster time-to-first-byte
    ) -> tuple[Iterator[bytes], int, dict[str, str]]:
        """Proxies compressed stream chunks supporting HTTP Range requests for browser playback."""
        stream_info = cls.get_stream_info(video_id)
        session = cls._get_http_session()

        # Always send a Range header so YouTube CDN returns 206 + Content-Range
        # and never throttles the connection as an unbounded 200 OK download.
        effective_range = range_header if range_header else "bytes=0-"

        def _open_upstream(info: AudioStreamInfo):
            req_headers = dict(info.http_headers)
            req_headers["Range"] = effective_range
            return session.get(
                info.stream_url,
                headers=req_headers,
                stream=True,
                timeout=(5, 15),
            )

        resp = _open_upstream(stream_info)

        # If the cached YouTube URL expired early or returned 403, refresh once
        if resp.status_code in (401, 403):
            resp.close()
            stream_info = cls.get_stream_info(video_id, force_refresh=True)
            resp = _open_upstream(stream_info)

        resp.raise_for_status()

        status_code = resp.status_code
        mime_map = {
            "webm": "audio/webm",
            "m4a": "audio/mp4",
            "mp4": "audio/mp4",
            "opus": "audio/ogg",
        }
        content_type = resp.headers.get(
            "Content-Type", mime_map.get(stream_info.ext, "audio/webm")
        )

        resp_headers: dict[str, str] = {
            "Content-Type": content_type,
            "Accept-Ranges": "bytes",
            # Explicit CORS headers so <audio crossOrigin="anonymous"> + Web Audio AnalyserNode
            # never get marked as CORS-tainted on 206 Partial Content responses
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Range",
            "Access-Control-Expose-Headers": "Content-Range, Content-Length, Accept-Ranges",
        }
        for key in ("Content-Length", "Content-Range"):
            val = resp.headers.get(key)
            if val:
                resp_headers[key] = val

        def _chunk_generator() -> Iterator[bytes]:
            try:
                for chunk in resp.iter_content(chunk_size=chunk_size):
                    if chunk:
                        yield chunk
            finally:
                resp.close()

        return _chunk_generator(), status_code, resp_headers

    # -------------------------------------------------------------------------
    # Disk Materialization (Download)
    # -------------------------------------------------------------------------
    def download_track(self, video_id: str, destination_dir: Path) -> Path:
        """Downloads and remuxes track audio to .opus with metadata using FFmpeg.

        Avoids yt-dlp 403 errors by reusing authenticated stream headers.
        """
        destination_dir.mkdir(parents=True, exist_ok=True)
        stream_info = self.get_stream_info(video_id)

        artist = self._sanitize_filename(stream_info.artist or "Unknown Artist")
        title = self._sanitize_filename(stream_info.title or "Unknown Title")
        out_filename = f"{artist} - {title}.opus"

        with tempfile.TemporaryDirectory(prefix="sinatra_dl_") as tmp_dir:
            temp_file = Path(tmp_dir) / out_filename

            cmd = [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                *self._build_ffmpeg_network_args(stream_info.http_headers),
                "-i",
                stream_info.stream_url,
                "-vn",
            ]

            # Direct stream copy if source is already Opus; otherwise transcode
            if stream_info.acodec == "opus":
                cmd.extend(["-c:a", "copy"])
            else:
                cmd.extend(["-c:a", "libopus", "-b:a", "160k"])

            # Embed essential metadata tags
            cmd.extend(
                [
                    "-metadata",
                    f"title={stream_info.title or 'Unknown Title'}",
                    "-metadata",
                    f"artist={stream_info.artist or 'Unknown Artist'}",
                    str(temp_file),
                ]
            )

            result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            if (
                result.returncode != 0
                or not temp_file.exists()
                or temp_file.stat().st_size == 0
            ):
                err_msg = result.stderr.decode().strip()
                raise RuntimeError(f"FFmpeg download failed for {video_id}: {err_msg}")

            final_destination = self._resolve_unique_path(destination_dir, out_filename)

            # Atomic move across filesystems
            shutil.move(str(temp_file), str(final_destination))

        return final_destination

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
