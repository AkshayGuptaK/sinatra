import argparse
import os
from pathlib import Path
import time
from typing import List, Optional, Tuple
from src.pg import get_pg
from src.services.lyrics import LyricsService

BATCH_SIZE = 25


def _extract_fallback_title_artist(filepath: str) -> Tuple[str, str]:
    """Derives (title, artist) from the filename if DB tags are blank."""
    stem = Path(filepath).stem
    if " - " in stem:
        parts = stem.split(" - ", 1)
        return parts[1].strip(), parts[0].strip()
    return stem.strip(), ""


def backfill_lyrics(overwrite: bool = False, delay: float = 0.35):
    db = get_pg()
    lyrics_service = LyricsService()

    # Query tracks that have tags, but do NOT contain 'instrumental' in the array
    query = """
        SELECT filepath, title, artist 
        FROM nodes 
        WHERE filepath IS NOT NULL
          AND tags IS NOT NULL 
          AND array_length(tags, 1) > 0
          AND NOT ('instrumental' = ANY(tags))
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
        print("No tracks to process.")
        return

    update_payloads: List[Tuple[str, str]] = []
    processed = 0
    found_count = 0

    for i, (filepath, title, artist) in enumerate(rows):
        # Resolve song title and artist
        resolved_title = (title or "").strip()
        resolved_artist = (artist or "").strip()

        if not resolved_title:
            resolved_title, fallback_artist = _extract_fallback_title_artist(filepath)
            if not resolved_artist:
                resolved_artist = fallback_artist

        lyrics_text: Optional[str] = None
        try:
            res = lyrics_service.get_lyrics(
                title=resolved_title, artist=resolved_artist
            )
            if res and res.text and len(res.text.strip()) > 20:
                lyrics_text = res.text.strip()
                found_count += 1
                print("Found", resolved_title)
            else:
                print("Couldn't find song", resolved_title)
        except Exception as e:
            print(
                f"\n⚠️ Error fetching lyrics for '{resolved_title}' by '{resolved_artist}': {e}"
            )

        # If lyrics found, queue update
        if lyrics_text:
            update_payloads.append((lyrics_text, filepath))

        # Polite rate-limiting between outbound network requests
        if delay > 0:
            time.sleep(delay)

        # Flush batch
        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            print(
                f"Processed {i + 1}/{total_tracks} tracks (Saved {found_count} lyrics)...",
                end="\r",
                flush=True,
            )
            update_payloads = []

    # Final flush
    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)

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
        help="Re-fetch and overwrite lyrics for all matching tracks even if lyrics already exist.",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.4,
        help="Delay in seconds between remote fetch requests (default: 0.35s to respect LRCLIB limits).",
    )
    args = parser.parse_args()

    backfill_lyrics(overwrite=args.overwrite, delay=args.delay)
