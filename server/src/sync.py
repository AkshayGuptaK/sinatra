# This module syncs store state to source state
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
import numpy as np
from src.pg import get_pg
from src.sources import *
from src.models.mert import get_mert_embedder
from src.models.projector.mood_projector import get_mood_projector
from src.services import (
    get_audio_chunker,
    get_emotion_scorer,
    get_metadata_extractor,
    compute_rms_envelope,
)
from src.api.events import broadcast_event

ai_executor = ThreadPoolExecutor(max_workers=1)

SAMPLE_RATE = 24000


def _process_single_file(path):
    try:
        # Decode Audio (Stereo for phase-immune silence detection)
        raw_audio = FileSystemSource.read_file(path, SAMPLE_RATE, 2)
        if hasattr(raw_audio, "numpy"):
            raw_audio = raw_audio.numpy()
        waveform = np.asarray(raw_audio, dtype=np.float32).squeeze()
        chunker = get_audio_chunker()
        chunked_track = chunker.chunk(waveform)

        if not chunked_track.chunks:
            print(f"⚠️ No audio chunks generated for {path}")
            return

        music_start = float(chunked_track.chunks[0].start_sec)
        music_end = float(chunked_track.chunks[-1].end_sec)

        rms_env = compute_rms_envelope(waveform, n_points=200)

        embedder = get_mert_embedder()
        embedded_chunks = embedder.extract(chunked_track.chunks)

        scorer = get_emotion_scorer()
        chunk_emotion_vecs = []

        for c in embedded_chunks:
            emotion_dict, emotion_vect = scorer.score(c["acoustic_embedding"])
            c["acoustic_emotions"] = emotion_dict
            c["acoustic_emotion_vector"] = emotion_vect
            chunk_emotion_vecs.append(emotion_vect)

        durations = np.array(
            [float(c["duration"]) for c in embedded_chunks], dtype=np.float32
        )
        total_dur = durations.sum()
        weights = (
            (durations / total_dur)
            if total_dur > 0
            else (np.ones_like(durations) / len(durations))
        )

        chunk_embs = np.array(
            [c["acoustic_embedding"] for c in embedded_chunks], dtype=np.float32
        )
        global_acoustic_embedding = np.sum(chunk_embs * weights[:, np.newaxis], axis=0)
        (global_emotions, global_emot_vec) = scorer.score(global_acoustic_embedding)

        projector = get_mood_projector()
        coord_x, coord_y = projector.project_track(global_emotions)

        extractor = get_metadata_extractor()
        meta = extractor.extract(path)
        track_duration = (
            meta.duration
            if meta and meta.duration > 0
            else chunked_track.total_duration
        )

        db = get_pg()
        track_id = db.upsert_track(
            source_id=path,
            title=meta.title if meta else "",
            artist=meta.artist if meta else "",
            album=meta.album if meta else "",
            duration=track_duration,
            acoustic_embedding=global_acoustic_embedding.tolist(),
            acoustic_emotions=global_emotions,
            acoustic_emotion_vector=global_emot_vec,
            acoustic_emotion_coords=[coord_x, coord_y],
            music_start=music_start,
            music_end=music_end,
            rms_env=rms_env,
        )

        db.save_track_chunks(track_id=track_id, chunks=embedded_chunks)

        print(
            f"✅ Ingested {meta.title if meta else path} ({len(embedded_chunks)} chunks "
        )
        return True

    except Exception as e:
        print(f"Failed to ingest {path}: {e}")
        return False


async def _ingest_files(paths, store):
    if not paths:
        return

    valid_paths = [p for p in paths if FileSystemSource.is_audio_file(p)]
    if not valid_paths:
        print("No valid audio files to ingest.")
        return

    print(f"Starting ingestion for {len(valid_paths)} files...")
    loop = asyncio.get_running_loop()

    async def _ingest_single(path: str):
        success = await loop.run_in_executor(ai_executor, _process_single_file, path)
        if success:
            await broadcast_event(
                "library:updated",
                {"count": 1, "timestamp": datetime.utcnow().isoformat()},
            )

    tasks = [_ingest_single(fname) for fname in valid_paths]
    await asyncio.gather(*tasks)
    print("Ingestion batch complete.")


async def _delete_orphaned_tracks(db_stats, local_stats, store):
    db_filenames = {s.location for s in db_stats}
    local_filenames = {s.location for s in local_stats}
    orphaned = db_filenames - local_filenames

    if orphaned:
        print(f"Deleting {len(orphaned)} tracks for missing files")
        deleted_ids = store.delete_by_filenames(orphaned)
        if deleted_ids:
            await broadcast_event("library:deleted", {"track_ids": deleted_ids})


async def _update_stale_tracks(db_stats, local_stats, store):
    db_map = {s.location: s for s in db_stats}
    local_map = {s.location: s for s in local_stats}

    stale = {
        fname
        for fname in (set(local_map.keys()) & set(db_map.keys()))
        if local_map[fname].last_modified_at > db_map[fname].last_indexed_at
    }

    if stale:
        print(f"Re-indexing {len(stale)} modified files")
        store.delete_by_filenames(stale)
        await _ingest_files(stale, store)
        # could wrap in transaction


async def _ingest_new_files(db_stats, local_stats, store):
    db_filenames = {s.location for s in db_stats}
    local_filenames = {s.location for s in local_stats}
    new = local_filenames - db_filenames

    if new:
        print(f"Ingesting {len(new)} files")
        await _ingest_files(new, store)


async def sync_file(path):
    db = get_pg()
    db.delete_by_filenames([path])
    await _ingest_files([path], db)


async def delete_file_from_store(path):
    deleted_ids = get_pg().delete_by_filenames([path])
    if deleted_ids:
        await broadcast_event("library:deleted", {"track_ids": deleted_ids})


async def sync_store():
    pg = get_pg()
    fs = FileSystemSource()
    db_stats = pg.get_file_stats()
    local_stats = fs.get_source_stats()

    print("Syncing...")
    await _delete_orphaned_tracks(db_stats, local_stats, pg)
    await _update_stale_tracks(db_stats, local_stats, pg)
    await _ingest_new_files(db_stats, local_stats, pg)
    print("Sync complete.")
