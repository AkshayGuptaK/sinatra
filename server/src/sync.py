# This module syncs store state to source state
import asyncio
from concurrent.futures import ThreadPoolExecutor
from src.pg import get_pg
from src.sources import *
from src.embedding import get_musical_embedder
from src.mood_scorer import get_mood_scorer

ai_executor = ThreadPoolExecutor(max_workers=1)


def _process_single_file(path):
    try:
        embedder = get_musical_embedder()
        raw_embedding = embedder.extract(path)

        scorer = get_mood_scorer()
        moods, mood_vec, moods_norm, mood_norm_vec = scorer.score(raw_embedding)

        db = get_pg()
        db.upsert_track(
            filepath=path,
            embedding=raw_embedding.tolist(),
            moods=moods,
            mood_vector=mood_vec,
            moods_normalized=moods_norm,
            mood_vector_normalized=mood_norm_vec,
        )

    except Exception as e:
        print(f"Failed to ingest {path}: {e}", flush=True)


async def _ingest_files(paths, store):
    if not paths:
        return

    valid_paths = [p for p in paths if FileSystemSource.is_audio_file(p)]
    
    if not valid_paths:
        print("No valid audio files to ingest.", flush=True)
        return

    print(f"Starting ingestion for {len(valid_paths)} files...", flush=True)

    loop = asyncio.get_running_loop()

    tasks = [
        loop.run_in_executor(ai_executor, _process_single_file, fname)
        for fname in valid_paths
    ]

    await asyncio.gather(*tasks)
    print("Ingestion batch complete.", flush=True)


def _delete_orphaned_nodes(db_stats, local_stats, store):
    db_filenames = {s.location for s in db_stats}
    local_filenames = {s.location for s in local_stats}
    orphaned = db_filenames - local_filenames

    if orphaned:
        print(f"Deleting {len(orphaned)} nodes for missing files", flush=True)
        store.delete_by_filenames(orphaned)


async def _update_stale_nodes(db_stats, local_stats, store):
    db_map = {s.location: s for s in db_stats}
    local_map = {s.location: s for s in local_stats}

    stale = {
        fname
        for fname in (set(local_map.keys()) & set(db_map.keys()))
        if local_map[fname].last_modified_at > db_map[fname].last_indexed_at
    }

    if stale:
        print(f"Re-indexing {len(stale)} modified files", flush=True)
        store.delete_by_filenames(stale)
        await _ingest_files(stale, store)
        # could wrap in transaction


async def _ingest_new_files(db_stats, local_stats, store):
    db_filenames = {s.location for s in db_stats}
    local_filenames = {s.location for s in local_stats}
    new = local_filenames - db_filenames

    if new:
        print(f"Ingesting {len(new)} files", flush=True)
        await _ingest_files(new, store)


async def sync_file(path):
    db = get_pg()
    db.delete_by_filenames([path])
    await _ingest_files([path], db)


def delete_file_from_store(path):
    get_pg().delete_by_filenames([path])


async def sync_store():
    pg = get_pg()
    fs = FileSystemSource()
    db_stats = pg.get_file_stats()
    local_stats = fs.get_source_stats()

    print("Syncing...", flush=True)
    _delete_orphaned_nodes(db_stats, local_stats, pg)
    await _update_stale_nodes(db_stats, local_stats, pg)
    await _ingest_new_files(db_stats, local_stats, pg)
    print("Sync complete.", flush=True)
