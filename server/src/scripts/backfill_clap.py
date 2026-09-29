import os
from typing import List, Tuple
from src.pg import get_pg
from src.models.clap import get_clap_embedder

BATCH_SIZE = 25  # Audio models use more VRAM, batch smaller


def backfill_clap_embeddings():
    db = get_pg()
    embedder = get_clap_embedder()

    print("Fetching tracks needing CLAP embeddings...")
    with db.conn.cursor() as cur:
        cur.execute(
            """
            SELECT filepath 
            FROM nodes 
            WHERE filepath IS NOT NULL 
              AND semantic_embedding IS NULL;
            """
        )
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"Found {total_tracks} tracks to process.")
    if total_tracks == 0:
        print("All tracks already have CLAP embeddings.")
        return

    update_payloads: List[Tuple[str, str]] = []
    processed = 0

    for i, (filepath,) in enumerate(rows):
        if not os.path.exists(filepath):
            continue

        try:
            vector = embedder.extract(filepath)
            # Format vector string for pgvector: "[v0,v1,...,v511]"
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

    print("\nCLAP backfill complete.")


def _flush_batch(db, batch_data: List[Tuple[str, str]]):
    with db.conn.cursor() as cur:
        # Psycopg 3's executemany handles batching natively
        cur.executemany(
            """
            UPDATE nodes 
            SET semantic_embedding = %s::vector,
                updated_at = NOW()
            WHERE filepath = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    backfill_clap_embeddings()