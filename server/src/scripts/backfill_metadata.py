import os
from src.pg import get_pg
from src.audio_metadata import AudioMetadataExtractor

BATCH_SIZE = 100


def sync_metadata(force_all: bool = False):
    db = get_pg()
    extractor = AudioMetadataExtractor()

    print("Fetching track records from PostgreSQL...")
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

        meta = extractor.extract(filepath)
        update_payloads.append(
            (meta.title, meta.artist, meta.album, meta.duration, node_id)
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

    print(f"\nSuccessfully updated metadata across {processed} tracks.")


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
