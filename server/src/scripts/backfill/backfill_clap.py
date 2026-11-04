import argparse
import os
import sys
from pathlib import Path
from typing import List, Tuple
import numpy as np
import torch

from src.pg import get_pg
from src.models.clap import get_clap_embedder

DEFAULT_BATCH_SIZE = 25


def backfill_clap_embeddings(
    overwrite: bool = False,
    batch_size: int = DEFAULT_BATCH_SIZE,
    limit: int | None = None,
):
    db = get_pg()
    embedder = get_clap_embedder()

    # 1. Build fetch query
    query = f"""
        SELECT id, filepath 
        FROM tracks 
        WHERE filepath IS NOT NULL
    """
    if not overwrite:
        query += " AND semantic_embedding IS NULL"
    query += " ORDER BY id ASC"

    if limit is not None:
        query += f" LIMIT {limit}"
    query += ";"

    mode_str = (
        f"ALL tracks in 'tracks' (OVERWRITE enabled)"
        if overwrite
        else f"tracks in 'tracks' needing CLAP embeddings"
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

    update_payloads: List[Tuple[str, str]] = []
    processed = 0
    success_count = 0
    error_count = 0

    for idx, (track_id, filepath) in enumerate(rows, 1):
        if not os.path.exists(filepath):
            print(f"\n⚠️ File missing from disk: {filepath}")
            error_count += 1
            continue

        try:
            # Extract 512-D numpy vector
            raw_vector = embedder.extract(filepath)

            # Ensure unit L2 normalization
            norm = np.linalg.norm(raw_vector)
            if norm > 1e-12:
                vector = raw_vector / norm
            else:
                vector = raw_vector

            # Format vector string for pgvector: "[v0,v1,...,v511]"
            vec_str = f"[{','.join(f'{x:.6f}' for x in vector)}]"
            update_payloads.append((vec_str, str(track_id)))
            success_count += 1

        except Exception as e:
            print(f"\n❌ Failed to embed {Path(filepath).name}: {e}")
            error_count += 1
            continue

        # Flush batch
        if len(update_payloads) >= batch_size:
            _flush_batch(db, update_payloads)
            processed += len(update_payloads)
            pct = (idx / total_tracks) * 100
            print(
                f"   Saved {processed}/{total_tracks} ({pct:.1f}%)... Latest: {Path(filepath).name[:30]}",
                end="\r",
                flush=True,
            )
            update_payloads = []

            # Clean up PyTorch MPS/CUDA memory between batches
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
            elif torch.cuda.is_available():
                torch.cuda.empty_cache()

    # Flush final remainder
    if update_payloads:
        _flush_batch(db, update_payloads)
        processed += len(update_payloads)

    print(
        f"\n✅ CLAP backfill complete: {success_count}/{total_tracks} tracks updated ({error_count} failed)."
    )


def _flush_batch(db, batch_data: List[Tuple[str, str]]):
    """Flushes updates by primary key ID to avoid filepath path-encoding collisions."""
    with db.conn.cursor() as cur:
        cur.executemany(
            f"""
            UPDATE tracks 
            SET semantic_embedding = %s::vector,
                updated_at = NOW()
            WHERE id = %s::uuid;
            """,
            batch_data,
        )
    db.conn.commit()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill CLAP 512-D audio embeddings into PostgreSQL."
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Recompute and overwrite semantic_embedding for all tracks.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help=f"Number of tracks per database commit batch (default: {DEFAULT_BATCH_SIZE}).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on number of tracks to process for testing.",
    )
    args = parser.parse_args()

    backfill_clap_embeddings(
        overwrite=args.overwrite,
        batch_size=args.batch_size,
        limit=args.limit,
    )
