import argparse
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from src.pg import get_pg
from src.services.lyrics import LyricsService

BATCH_SIZE = 10

# Setup resilient HTTP session for LRCLIB
_session = requests.Session()
_session.headers.update({
    "User-Agent": "SinatraMusicPlayer/1.0 (lyric-backfill-tool)"
})
_retries = Retry(
    total=3,
    backoff_factor=1.2,
    status_forcelist=[429, 500, 502, 503, 504],
    raise_on_status=False,
)
_session.mount("https://", HTTPAdapter(max_retries=_retries))


def clean_title(title: str) -> str:
    """Removes file extensions and parenthetical/bracketed metadata."""
    # 1. Strip common audio/video file extensions
    cleaned = re.sub(r"\.(?:mp3|flac|m4a|wav|aac|ogg|opus|wmv|mp4|webm|mkv)$", "", title, flags=re.I)
    # 2. Strip bracketed remarks like (Speedy mix), [Remastered], (feat. X)
    cleaned = re.sub(r"\s*[\(\[\{].*?[\)\]\}]", "", cleaned)
    return cleaned.strip()


def extract_primary_artist(artist: str) -> str:
    """Extracts the lead artist from collaboration strings ('A feat. B', 'A & B', 'A, B')."""
    if not artist:
        return ""
    # Split on feat, ft, &, commas, vs
    parts = re.split(r"\s+(?:feat\.?|ft\.?|vs\.?|&)\s+|,\s*", artist, flags=re.I)
    return parts[0].strip() if parts else artist.strip()


def _extract_fallback_title_artist(filepath: str) -> Tuple[str, str]:
    """Derives (title, artist) from filename if DB tags are missing."""
    stem = Path(filepath).stem
    if " - " in stem:
        parts = stem.split(" - ", 1)
        return parts[1].strip(), parts[0].strip()
    return stem.strip(), ""


def fetch_title_candidates(query_title: str, limit: int = 6) -> List[Dict[str, Any]]:
    """Queries LRCLIB search API by title and returns distinct candidates with lyrics."""
    url = "https://lrclib.net/api/search"
    try:
        resp = _session.get(url, params={"track_name": query_title}, timeout=8)
        if resp.status_code != 200:
            print(f"⚠️ LRCLIB search failed with status {resp.status_code}")
            return []

        candidates = resp.json()
        results: List[Dict[str, Any]] = []
        seen_artists = set()

        for c in candidates:
            artist = c.get("artistName", "").strip()
            lyrics = c.get("plainLyrics") or c.get("syncedLyrics")
            if (
                artist
                and lyrics
                and len(lyrics.strip()) > 20
                and artist.lower() not in seen_artists
            ):
                seen_artists.add(artist.lower())
                results.append({
                    "artist": artist,
                    "title": c.get("trackName", "").strip(),
                    "album": c.get("albumName", "").strip(),
                    "lyrics": lyrics.strip(),
                })
            if len(results) >= limit:
                break
        return results
    except Exception as e:
        print(f"⚠️ Network error querying candidates: {e}")
        return []


def prompt_candidates_with_custom(
    song_title: str, current_artist: str
) -> Optional[str]:
    """Interactively handles candidate selection and custom search queries.
    Returns the selected lyrics text, or None if skipped.
    """
    search_term = clean_title(song_title) or song_title

    while True:
        candidates = fetch_title_candidates(search_term)

        print(f"\n❓ Resolving: '{song_title}' (Artist: '{current_artist or 'Unknown'}')")
        if search_term != song_title:
            print(f"   [Querying as: '{search_term}']")

        if candidates:
            print("   Candidates on LRCLIB:")
            for idx, c in enumerate(candidates, 1):
                album_info = f" [Album: {c['album']}]" if c.get("album") else ""
                print(f"   [{idx}] {c['artist']} — '{c['title']}'{album_info}")
        else:
            print("   No candidate lyrics found for this term.")

        print("   [c] Custom search query")
        print("   [s] Skip this track")

        choice = input("   Select option: ").strip().lower()

        if choice.isdigit() and candidates and 1 <= int(choice) <= len(candidates):
            selected = candidates[int(choice) - 1]
            return selected["lyrics"]

        if choice == "c":
            custom_input = input("   Enter search title / terms (or Enter to cancel): ").strip()
            if custom_input:
                search_term = custom_input
                continue  # Re-query LRCLIB with the new search term
        
        if choice in ("s", ""):
            return None

        print("   Invalid option, try again.")


def backfill_lyrics(
    overwrite: bool = False, delay: float = 0.35, interactive: bool = False
):
    db = get_pg()
    lyrics_service = LyricsService()

    query = """
        SELECT filepath, title, artist 
        FROM nodes 
        WHERE filepath IS NOT NULL
          AND tags IS NOT NULL 
          AND array_length(tags, 1) > 0
          AND NOT ('instrumental' = ANY(tags))
          AND NOT ('vocalise' = ANY(tags))
    """
    if not overwrite:
        query += " AND (lyrics IS NULL OR trim(lyrics) = '')"
    query += " ORDER BY id ASC;"

    mode_str = (
        "ALL tagged non-instrumental tracks (OVERWRITE enabled)"
        if overwrite
        else "tagged non-instrumental tracks needing lyrics"
    )
    print(f"🔍 Fetching {mode_str}...")

    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"Found {total_tracks} tracks to process.")
    if total_tracks == 0:
        return

    update_payloads: List[Tuple[str, str]] = []
    found_count = 0

    for i, (filepath, title, artist) in enumerate(rows):
        resolved_title = (title or "").strip()
        resolved_artist = (artist or "").strip()

        if not resolved_title:
            resolved_title, fallback_artist = _extract_fallback_title_artist(filepath)
            if not resolved_artist:
                resolved_artist = fallback_artist

        lyrics_text: Optional[str] = None

        try:
            # 1. Exact lookup
            res = lyrics_service.get_lyrics(title=resolved_title, artist=resolved_artist)
            if res and res.text and len(res.text.strip()) > 20:
                lyrics_text = res.text.strip()

            # 2. Cleaned title fallback (strip .wmv, brackets, etc.)
            cleaned = clean_title(resolved_title)
            if not lyrics_text and cleaned and cleaned != resolved_title:
                res = lyrics_service.get_lyrics(title=cleaned, artist=resolved_artist)
                if res and res.text and len(res.text.strip()) > 20:
                    lyrics_text = res.text.strip()

            # 3. Primary artist fallback (e.g., strip 'feat. X' or '& Y')
            primary_artist = extract_primary_artist(resolved_artist)
            if not lyrics_text and primary_artist and primary_artist != resolved_artist:
                res = lyrics_service.get_lyrics(title=cleaned or resolved_title, artist=primary_artist)
                if res and res.text and len(res.text.strip()) > 20:
                    lyrics_text = res.text.strip()

            # 4. Interactive candidate search & custom query fallback
            if not lyrics_text and interactive:
                print()  # Ensure prompt prints on a clean terminal line
                lyrics_text = prompt_candidates_with_custom(resolved_title, resolved_artist)

            if lyrics_text:
                found_count += 1
                print(f"Found: {resolved_title}")
            else:
                print(f"Couldn't find song: {resolved_title}")

        except Exception as e:
            print(f"\n⚠️ Error fetching lyrics for '{resolved_title}': {e}")

        # Queue DB update if lyrics retrieved
        if lyrics_text:
            update_payloads.append((lyrics_text, filepath))

        if delay > 0:
            time.sleep(delay)

        # Batch write to PostgreSQL
        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            print(
                f"Progress: {i + 1}/{total_tracks} tracks (Saved {found_count})...",
                end="\r",
                flush=True,
            )
            update_payloads = []

    # Final batch write
    if update_payloads:
        _flush_batch(db, update_payloads)

    print(
        f"\n✅ Lyrics backfill complete. Retrieved and saved lyrics for {found_count}/{total_tracks} tracks."
    )


def _flush_batch(db, batch_data: List[Tuple[str, str]]):
    with db.conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE nodes 
            SET lyrics = %s,
                updated_at = NOW()
            WHERE filepath = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill song lyrics into PostgreSQL for non-instrumental tagged tracks."
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Re-fetch and overwrite lyrics for all matching tracks.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.35,
        help="Delay in seconds between requests.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Run in interactive mode to disambiguate or enter custom queries.",
    )

    args = parser.parse_args()
    backfill_lyrics(
        overwrite=args.overwrite, delay=args.delay, interactive=args.interactive
    )