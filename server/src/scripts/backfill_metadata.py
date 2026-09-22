import json
import os
from pathlib import Path
import subprocess
from typing import Any, Dict, Optional
import mutagen
from mutagen.flac import FLAC
from mutagen.oggopus import OggOpus
from src.pg import get_pg

BATCH_SIZE = 100


def _get_tag_value(tags: Any, *keys: str) -> Optional[str]:
    """Helper to safely extract the first non-empty tag across case conventions and container types."""
    if tags is None:
        return None

    # Handle dictionary-like tags (FLAC, Ogg Opus, ID3, MP4)
    for key in keys:
        # Check exact key
        val = None
        if key in tags:
            val = tags[key]
        else:
            # Case-insensitive check for Vorbis comments (e.g. 'title' vs 'TITLE')
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


def _ffprobe_metadata(filepath: str) -> Dict[str, Any]:
    """Fallback metadata and duration extractor using ffprobe for finicky Opus/FLAC containers."""
    data = {"title": None, "artist": None, "album": None, "duration": 0.0}
    try:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            filepath
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
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


def extract_metadata(filepath: str) -> Dict[str, Any]:
    """Reads title, artist, album, and duration, falling back to ffprobe on header failure."""
    data = {
        "title": None,
        "artist": None,
        "album": None,
        "duration": 0.0,
    }

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
                data["duration"] = round(float(audio.info.length), 3)

            tags = audio.tags
            data["title"] = _get_tag_value(tags, "title", "TITLE", "TIT2", "©nam")
            data["artist"] = _get_tag_value(tags, "artist", "ARTIST", "TPE1", "©ART", "Author", "WM/AlbumArtist")
            data["album"] = _get_tag_value(tags, "album", "ALBUM", "TALB", "©alb", "WM/AlbumTitle")

    except Exception:
        pass

    # If duration is still missing/0, or metadata is blank, try ffprobe
    if data["duration"] == 0.0 or not data["title"]:
        probe_data = _ffprobe_metadata(filepath)
        if data["duration"] == 0.0 and probe_data["duration"] > 0:
            data["duration"] = probe_data["duration"]
        if not data["title"]:
            data["title"] = probe_data["title"]
        if not data["artist"]:
            data["artist"] = probe_data["artist"]
        if not data["album"]:
            data["album"] = probe_data["album"]

    # Final fallback for title: clean filename stem
    if not data["title"]:
        data["title"] = Path(filepath).stem

    return data


def sync_metadata(force_all: bool = False):
    db = get_pg()

    print("⏳ Fetching track records from PostgreSQL...")
    with db.conn.cursor() as cur:
        if force_all:
            cur.execute("SELECT id, filepath FROM nodes WHERE filepath IS NOT NULL;")
        else:
            cur.execute(
                """
                SELECT id, filepath 
                FROM nodes 
                WHERE filepath IS NOT NULL 
                  AND (title IS NULL OR artist IS NULL OR album IS NULL OR duration IS NULL OR duration = 0);
                """
            )
        rows = cur.fetchall()

    total = len(rows)
    print(f"Found {total} tracks to process for metadata...")
    if total == 0:
        print("All tracks already have complete metadata.")
        return

    update_payloads = []
    processed = 0

    for node_id, filepath in rows:
        if not os.path.exists(filepath):
            continue

        meta = extract_metadata(filepath)

        update_payloads.append(
            (
                meta["title"],
                meta["artist"],
                meta["album"],
                meta["duration"],
                node_id,
            )
        )

        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            print(f"Updated {processed}/{total} tracks...", end="\r", flush=True)
            update_payloads = []

    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)
        print(f"Updated {processed}/{total} tracks.")

    print(f"\n✅ Successfully updated metadata across {processed} tracks.")


def _flush_batch(db, batch_data):
    with db.conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE nodes 
            SET title = %s,
                artist = %s,
                album = %s,
                duration = %s,
                updated_at = NOW()
            WHERE id = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    sync_metadata(force_all=False)