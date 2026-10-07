import argparse
from typing import List, Tuple
from src.pg import get_pg
from src.services.lyrics.embedder import get_lyrics_embedder

BATCH_SIZE = 25


def backfill_lyrics_embeddings(overwrite: bool = False):
    db = get_pg()
    embedder = get_lyrics_embedder()

    query = """
        SELECT id, lyrics 
        FROM nodes 
        WHERE lyrics IS NOT NULL 
          AND trim(lyrics) != ''
    """
    if not overwrite:
        query += " AND lyrical_embedding IS NULL"
    query += " ORDER BY id ASC;"

    mode_str = (
        "ALL tracks with lyrics (OVERWRITE enabled)"
        if overwrite
        else "tracks with lyrics needing lyrical embeddings"
    )
    print(f"Fetching {mode_str}...")

    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"Found {total_tracks} tracks to process.")
    if total_tracks == 0:
        print("No tracks to process.")
        return

    update_payloads: List[Tuple[str, int]] = []
    processed = 0

    for i, (track_id, lyrics_text) in enumerate(rows):
        if not lyrics_text or not lyrics_text.strip():
            continue

        try:
            # Generate embedding via OllamaEmbedder (qwen3-embedding:4b, 2560-dim)
            vector = embedder.embed_document(lyrics_text.strip())

            # Format vector string for pgvector/halfvec: "[v0,v1,...,v2559]"
            vec_str = f"[{','.join(f'{x:.6f}' for x in vector)}]"
            update_payloads.append((vec_str, track_id))

        except Exception as e:
            print(f"\n❌ Failed to embed lyrics for track ID {track_id}: {e}")
            continue

        # Flush batch
        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            print(f"Updated {processed}/{total_tracks} tracks...", end="\r", flush=True)
            update_payloads = []

    # Final flush
    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)
        print(f"Updated {processed}/{total_tracks} tracks.")

    print("\n✅ Lyrics embedding backfill complete.")


def _flush_batch(db, batch_data: List[Tuple[str, int]]):
    with db.conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE nodes 
            SET lyrical_embedding = %s::halfvec,
                updated_at = NOW()
            WHERE id = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill Qwen lyrics embeddings into PostgreSQL halfvec(2560) column"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Recompute and overwrite lyrical_embedding for all tracks with lyrics.",
    )
    args = parser.parse_args()

    backfill_lyrics_embeddings(overwrite=args.overwrite)
