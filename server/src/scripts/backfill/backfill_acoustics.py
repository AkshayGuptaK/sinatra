import argparse
import json
import os
import sys
import time
from typing import Any, Dict, List, Optional, Tuple, Union
import numpy as np

from src.models.mert import get_mert_embedder
from src.models.projector.mood_projector import get_mood_projector
from src.services.emotion_scorer import get_emotion_scorer
from src.pg import get_pg
from src.services.audio_chunker import get_audio_chunker
import warnings

warnings.filterwarnings(
    "ignore",
    category=UserWarning,
    message=r".*An output with one or more elements was resized.*",
)

def backfill_acoustics(overwrite: bool = False, limit: Optional[int] = None):
    db = get_pg()
    chunker = get_audio_chunker()
    embedder = get_mert_embedder()
    scorer = get_emotion_scorer()
    projector = get_mood_projector()

    # 1. Query target tracks
    query = """
        SELECT id::text, filepath
        FROM nodes
        WHERE filepath IS NOT NULL
    """
    if not overwrite:
        query += """
          AND (
              musical_embedding IS NULL 
              OR emotions IS NULL 
              OR emotions_normalized IS NULL
              OR music_start IS NULL
          )
        """
    query += " ORDER BY id ASC"
    if limit and limit > 0:
        query += f" LIMIT {limit}"
    query += ";"

    mode_str = (
        "ALL tracks (OVERWRITE enabled)"
        if overwrite
        else "tracks missing acoustics, emotions, or boundaries"
    )
    print(f"🔍 Fetching {mode_str}...", flush=True)

    with db.conn.cursor() as cur:
        cur.execute(query)
        rows = cur.fetchall()

    total_tracks = len(rows)
    print(f"📦 Found {total_tracks} tracks to process.", flush=True)
    if total_tracks == 0:
        print("✅ Everything is up to date!")
        return

    update_sql = """
        UPDATE nodes
        SET musical_embedding = %s::vector,
            emotions = %s::jsonb,
            emotion_vector = %s::vector,
            emotions_normalized = %s::jsonb,
            emotion_vector_normalized = %s::vector,
            coord_x = %s,
            coord_y = %s,
            music_start = %s,
            music_end = %s,
            updated_at = NOW()
        WHERE id = %s::uuid;
    """

    processed = 0
    successful = 0
    skipped = 0
    t_start = time.perf_counter()

    for idx, (track_id, filepath) in enumerate(rows, 1):
        if not os.path.exists(filepath):
            print(
                f"⚠️ [{idx}/{total_tracks}] File not found on disk, skipping: {filepath}"
            )
            skipped += 1
            continue

        try:
            # 1. Structural Chunking & Boundary Identification
            chunked_track = chunker.chunk(filepath)
            if not chunked_track.chunks:
                print(
                    f"⚠️ [{idx}/{total_tracks}] No audio chunks produced for: {filepath}"
                )
                skipped += 1
                continue

            music_start = float(chunked_track.chunks[0].start_sec)
            music_end = float(chunked_track.chunks[-1].end_sec)

            # 2. Batched MERT Inference
            embedded_chunks = embedder.extract(chunked_track.chunks)

            # 3. Score Each Chunk
            chunk_embs = []
            for c in embedded_chunks:
                raw_dict, raw_vec, norm_dict, norm_vec = scorer.score(
                    c["acoustic_embedding"]
                )
                c["emotions"] = raw_dict
                c["emotion_vector"] = raw_vec
                c["emotions_normalized"] = norm_dict
                c["emotion_vector_normalized"] = norm_vec
                chunk_embs.append(c["acoustic_embedding"])

            # 4. Duration-Weighted Global Vectors
            durations = np.array(
                [float(c["duration"]) for c in embedded_chunks], dtype=np.float32
            )
            total_dur = durations.sum()
            weights = (
                (durations / total_dur)
                if total_dur > 0
                else (np.ones_like(durations) / len(durations))
            )

            chunk_embs_mat = np.array(chunk_embs, dtype=np.float32)
            global_musical_embedding = np.sum(
                chunk_embs_mat * weights[:, np.newaxis], axis=0
            )

            # 5. Global Affective Scoring (Median-Anchored Normalized)
            (
                global_emotions,
                global_raw_vec,
                global_emotions_norm,
                global_norm_vec,
            ) = scorer.score(global_musical_embedding)

            # 6. Coordinate Projection (coord_x, coord_y)
            coord_x, coord_y = projector.project_track(
                global_emotions, global_emotions_norm
            )

            # 7. Serialize Types for PostgreSQL
            musical_emb_str = db._format_vector_str(global_musical_embedding)
            emotions_json = json.dumps(global_emotions)
            emotion_vec_str = db._format_vector_str(global_raw_vec)
            emotions_norm_json = json.dumps(global_emotions_norm)
            emotion_norm_vec_str = db._format_vector_str(global_norm_vec)

            # 8. Update 'nodes' and atomically replace 'track_chunks'
            with db.conn.transaction():
                with db.conn.cursor() as cur:
                    cur.execute(
                        update_sql,
                        (
                            musical_emb_str,
                            emotions_json,
                            emotion_vec_str,
                            emotions_norm_json,
                            emotion_norm_vec_str,
                            coord_x,
                            coord_y,
                            music_start,
                            music_end,
                            track_id,
                        ),
                    )
                db.save_track_chunks(track_id=track_id, chunks=embedded_chunks)

            successful += 1
            processed += 1

            pct = (processed / total_tracks) * 100
            track_name = os.path.basename(filepath)
            print(
                f"[{processed}/{total_tracks}] ({pct:.1f}%) ✓ {track_name[:38]:<38} | {len(embedded_chunks)} chunks | {music_start:.1f}s-{music_end:.1f}s",
                flush=True,
            )

        except Exception as e:
            print(
                f"\n❌ [{idx}/{total_tracks}] Error backfilling {filepath}: {e}",
                file=sys.stderr,
                flush=True,
            )

    elapsed = time.perf_counter() - t_start
    avg_speed = elapsed / processed if processed > 0 else 0.0

    print("\n" + "=" * 80)
    print(f"✅ Acoustic & Affective Backfill Complete!")
    print(f"   • Total Processed : {processed}/{total_tracks}")
    print(f"   • Updated in DB   : {successful}")
    print(f"   • Skipped / Missing: {skipped}")
    print(f"   • Total Time      : {elapsed:.1f}s (~{avg_speed:.2f}s per track)")
    print("=" * 80)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Backfill MERT embeddings, Cowen-24 emotions, UMAP coordinates, and track chunks into PostgreSQL."
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Recompute and overwrite acoustics/emotions for ALL tracks, even if already populated.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Optional limit on number of tracks to process (useful for testing small batches).",
    )
    args = parser.parse_args()

    backfill_acoustics(overwrite=args.overwrite, limit=args.limit)
