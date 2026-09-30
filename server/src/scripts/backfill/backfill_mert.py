import argparse
import os
from typing import List, Tuple
from src.pg import get_pg
from src.models.mert import get_mert_embedder

BATCH_SIZE = 25  # Audio models use more VRAM, batch smaller


def backfill_mert_embeddings(overwrite: bool = False):
    db = get_pg()
    embedder = get_mert_embedder()

    query = """
        SELECT filepath 
        FROM nodes 
        WHERE filepath IS NOT NULL
    """
    if not overwrite:
        query += " AND musical_embedding IS NULL"
    query += ";"

    mode_str = (
        "ALL tracks (OVERWRITE enabled)"
        if overwrite
        else "tracks needing MERT embeddings"
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

    update_payloads: List[Tuple[str, str]] = []
    processed = 0

    for i, (filepath,) in enumerate(rows):
        if not os.path.exists(filepath):
            continue

        try:
            vector = embedder.extract(filepath)
            # Format vector string for pgvector: "[v0,v1,...,v1023]"
            vec_str = f"[{','.join(f'{x:.6f}' for x in vector)}]"
            update_payloads.append((vec_str, filepath))

        except Exception as e:
            print(f"\nFailed to embed {filepath}: {e}")
            continue

        # Flush batch
        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            print(f"Updated {processed}/{total_tracks} tracks...", end="\r", flush=True)
            update_payloads = []

    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)
        print(f"Updated {processed}/{total_tracks} tracks.")

    print("\nMERT backfill complete.")


def _flush_batch(db, batch_data: List[Tuple[str, str]]):
    with db.conn.cursor() as cur:
        # Psycopg 3's executemany handles batching natively
        cur.executemany(
            """
            UPDATE nodes 
            SET musical_embedding = %s::vector,
                updated_at = NOW()
            WHERE filepath = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill MERT embeddings into PostgreSQL"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Recompute and overwrite musical_embedding for all existing tracks.",
    )
    args = parser.parse_args()

    backfill_mert_embeddings(overwrite=args.overwrite)
