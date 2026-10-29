# server/src/scripts/backfill/backfill_rms_envelope.py
import argparse
import os
from pathlib import Path
from src.pg import get_pg
from src.services.rms import compute_rms_envelope
from src.sources import FileSystemSource

BATCH_SIZE = 50
SAMPLE_RATE = 22050  # Lightweight decoding rate for loudness profiling


def backfill_rms(overwrite: bool = False):
    db = get_pg()

    query = """
        SELECT id, filepath 
        FROM nodes 
        WHERE filepath IS NOT NULL
    """
    if not overwrite:
        query += " AND rms_envelope IS NULL"
    query += " ORDER BY id ASC;"

    mode_str = (
        "ALL tracks (OVERWRITE enabled)"
        if overwrite
        else "tracks needing RMS envelopes"
    )
    print(f"🔍 Fetching {mode_str}...")

    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"📦 Found {total_tracks} tracks to process.")
    if total_tracks == 0:
        print("✅ Everything is up to date!")
        return

    update_payloads = []
    processed = 0
    success_count = 0

    for idx, (track_id, filepath) in enumerate(rows, 1):
        if not os.path.exists(filepath):
            continue

        try:
            # 1. Decode audio waveform via FileSystemSource
            waveform = FileSystemSource.read_file(filepath, SAMPLE_RATE, channels=1)
            if waveform is None:
                continue

            # 2. Compute 200-point RMS envelope in memory
            envelope = compute_rms_envelope(waveform, n_points=200)

            # 3. Queue for batch update
            update_payloads.append((envelope, track_id))
            success_count += 1

        except Exception as e:
            print(f"\n⚠️ Error processing {Path(filepath).name}: {e}")
            continue

        # Flush batch
        if len(update_payloads) >= BATCH_SIZE:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            pct = (idx / total_tracks) * 100
            print(
                f"   Saved {processed}/{total_tracks} ({pct:.1f}%)... Latest: {Path(filepath).name[:30]}",
                end="\r",
                flush=True,
            )
            update_payloads = []

    # Final batch flush
    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)

    print(
        f"\n✅ RMS envelope backfill complete: {success_count}/{total_tracks} tracks updated."
    )


def _flush_batch(db, batch_data: list[tuple[list[float], str]]):
    with db.conn.cursor() as cur:
        cur.executemany(
            """
            UPDATE nodes 
            SET rms_envelope = %s::real[],
                updated_at = NOW()
            WHERE id = %s;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill 200-point RMS envelopes into PostgreSQL using FileSystemSource."
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Recompute and overwrite rms_envelope for all tracks.",
    )
    args = parser.parse_args()
    backfill_rms(overwrite=args.overwrite)
