import json
import numpy as np
from src.pg import get_pg
from src.mood_scorer import get_mood_scorer

BATCH_SIZE = 100


def backfill_moods():
    db = get_pg()
    scorer = get_mood_scorer()

    print("Fetching tracks needing mood backfill...")
    with db.conn.cursor() as cur:
        cur.execute(
            """
            SELECT filepath, musical_embedding 
            FROM nodes 
            WHERE musical_embedding IS NOT NULL 
              AND (moods IS NULL OR mood_vector IS NULL);
            """
        )
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"Found {total_tracks} tracks to process.")
    if total_tracks == 0:
        print("Everything is up to date!")
        return

    update_payloads = []
    processed = 0

    for filepath, raw_embedding in rows:
        # 1. Parse embedding into 1024-dim numpy array
        if isinstance(raw_embedding, str):
            # Handle string representation if pgvector returned "[v0, v1, ...]"
            cleaned = raw_embedding.strip("[]").split(",")
            emb = np.array([float(x) for x in cleaned], dtype=np.float32)
        else:
            emb = np.asarray(raw_embedding, dtype=np.float32)

        # 2. Score via MoodScorer
        moods_dict, mood_vector = scorer.score(emb)

        # 3. Format inputs for SQL
        moods_json = json.dumps(moods_dict)
        mood_vec_str = f"[{','.join(f'{x:.6f}' for x in mood_vector)}]"

        update_payloads.append((moods_json, mood_vec_str, filepath))

        # 4. Flush batch
        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            print(f"Updated {processed}/{total_tracks} tracks...")
            update_payloads = []

    # Final batch
    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)
        print(f"Updated {processed}/{total_tracks} tracks.")

    print("✅ Mood backfill complete!")


def _flush_batch(db, batch_data):
    with db.conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE nodes 
            SET moods = %s,
                mood_vector = %s::vector,
                updated_at = NOW()
            WHERE filepath = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    backfill_moods()