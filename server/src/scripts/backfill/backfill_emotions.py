import argparse
import json
import numpy as np
from src.pg import get_pg
from src.emotion_scorer import get_emotion_scorer

BATCH_SIZE = 100


def backfill_emotions(overwrite: bool = False):
    db = get_pg()
    scorer = get_emotion_scorer()

    query = """
        SELECT filepath, musical_embedding 
        FROM nodes 
        WHERE musical_embedding IS NOT NULL
    """
    if not overwrite:
        query += (
            " AND (emotions_normalized IS NULL OR emotion_vector_normalized IS NULL)"
        )
    query += ";"

    mode_str = (
        "ALL tracks (OVERWRITE enabled)"
        if overwrite
        else "tracks needing emotional backfill"
    )
    print(f"Fetching {mode_str}...")

    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"Found {total_tracks} tracks to process.")
    if total_tracks == 0:
        print("Everything is up to date!")
        return

    update_payloads = []
    processed = 0

    for filepath, raw_embedding in rows:
        if isinstance(raw_embedding, str):
            cleaned = raw_embedding.strip("[]").split(",")
            emb = np.array([float(x) for x in cleaned], dtype=np.float32)
        else:
            emb = np.asarray(raw_embedding, dtype=np.float32)

        # Unpack all 4 outputs: raw dict, raw vec, norm dict, norm vec
        emotions, emotion_vec, emotions_norm, emotion_norm_vec = scorer.score(emb)

        update_payloads.append(
            (
                json.dumps(emotions),
                f"[{','.join(f'{x:.6f}' for x in emotion_vec)}]",
                json.dumps(emotions_norm),
                f"[{','.join(f'{x:.6f}' for x in emotion_norm_vec)}]",
                filepath,
            )
        )

        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            print(f"Updated {processed}/{total_tracks} tracks...", end="\r", flush=True)
            update_payloads = []

    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)
        print(f"Updated {processed}/{total_tracks} tracks.")

    print("\n✅ Emotional backfill complete!")


def _flush_batch(db, batch_data):
    with db.conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE nodes 
            SET emotions = %s,
                emotion_vector = %s::vector,
                emotions_normalized = %s,
                emotion_vector_normalized = %s::vector,
                updated_at = NOW()
            WHERE filepath = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill emotion scores and vectors in PostgreSQL"
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Recompute and overwrite emotion vectors/scores for all tracks.",
    )
    args = parser.parse_args()

    backfill_emotions(overwrite=args.overwrite)
