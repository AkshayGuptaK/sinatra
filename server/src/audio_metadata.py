import json
import os
from pathlib import Path
import subprocess
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass, asdict

import mutagen
from mutagen.flac import FLAC
from mutagen.oggopus import OggOpus


@dataclass
class TrackMetadata:
    title: Optional[str]
    artist: Optional[str]
    album: Optional[str]
    duration: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class AudioMetadataExtractor:
    """Robust audio metadata and duration extractor.
    
    Reads title, artist, album, and duration using Mutagen, falling back to
    container-specific decoders (FLAC, OggOpus), ffprobe subprocess extraction,
    and filesystem stem fallbacks.
    """

    @staticmethod
    def _get_tag_value(tags: Any, *keys: str) -> Optional[str]:
        """Safely extracts the first non-empty tag across case conventions and container formats."""
        if tags is None:
            return None

        for key in keys:
            val = None
            if key in tags:
                val = tags[key]
            else:
                # Case-insensitive match (e.g. Vorbis comments 'title' vs 'TITLE')
                for t_k in tags.keys():
                    if str(t_k).lower() == key.lower():
                        val = tags[t_k]
                        break

            if val is not None:
                if isinstance(val, (list, tuple)) and len(val) > 0:
                    val = val[0]
                if hasattr(val, "text") and isinstance(val.text, (list, tuple)) and len(val.text) > 0:
                    val = val.text[0]
                elif hasattr(val, "value"):
                    val = val.value

                clean_str = str(val).strip()
                if clean_str:
                    return clean_str
        return None

    @staticmethod
    def _ffprobe_metadata(filepath: str) -> Dict[str, Any]:
        """Fallback metadata and duration extractor using ffprobe for finicky containers."""
        data = {"title": None, "artist": None, "album": None, "duration": 0.0}
        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                filepath,
            ]
            result = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                check=True,
            )
            probe = json.loads(result.stdout)
            fmt = probe.get("format", {})

            if "duration" in fmt:
                data["duration"] = round(float(fmt["duration"]), 3)

            tags = {k.lower(): v for k, v in fmt.get("tags", {}).items()}
            data["title"] = tags.get("title")
            data["artist"] = tags.get("artist")
            data["album"] = tags.get("album")
        except Exception:
            pass
        return data

    @classmethod
    def extract(cls, filepath: str) -> TrackMetadata:
        """Extracts title, artist, album, and duration from an audio file.

        Args:
            filepath: Path to audio file on disk.

        Returns:
            TrackMetadata dataclass with guaranteed title and duration fields.
        """
        title = None
        artist = None
        album = None
        duration = 0.0

        try:
            audio = mutagen.File(filepath)

            # Explicit fallback loaders for stubborn Opus or FLAC containers
            if audio is None:
                ext = Path(filepath).suffix.lower()
                if ext == ".opus":
                    try:
                        audio = OggOpus(filepath)
                    except Exception:
                        pass
                elif ext == ".flac":
                    try:
                        audio = FLAC(filepath)
                    except Exception:
                        pass

            if audio is not None:
                if hasattr(audio, "info") and getattr(audio.info, "length", None):
                    duration = round(float(audio.info.length), 3)

                tags = audio.tags
                title = cls._get_tag_value(tags, "title", "TITLE", "TIT2", "©nam")
                artist = cls._get_tag_value(
                    tags, "artist", "ARTIST", "TPE1", "©ART", "Author", "WM/AlbumArtist"
                )
                album = cls._get_tag_value(
                    tags, "album", "ALBUM", "TALB", "©alb", "WM/AlbumTitle"
                )
        except Exception:
            pass

        # If duration is missing/zero or metadata is incomplete, invoke ffprobe
        if duration == 0.0 or not title or not artist or not album:
            probe_data = cls._ffprobe_metadata(filepath)
            if duration == 0.0 and probe_data["duration"] > 0:
                duration = probe_data["duration"]
            if not title:
                title = probe_data["title"]
            if not artist:
                artist = probe_data["artist"]
            if not album:
                album = probe_data["album"]

        # Final title fallback: clean filename stem
        if not title:
            title = Path(filepath).stem

        return TrackMetadata(
            title=title,
            artist=artist,
            album=album,
            duration=duration,
        )


# Singleton instance helper
_metadata_extractor: Optional[AudioMetadataExtractor] = None


def get_metadata_extractor() -> AudioMetadataExtractor:
    global _metadata_extractor
    if _metadata_extractor is None:
        _metadata_extractor = AudioMetadataExtractor()
    return _metadata_extractor