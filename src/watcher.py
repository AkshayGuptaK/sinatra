import asyncio
from watchfiles import awatch, Change
from src.sync import sync_file, delete_file_from_store
from src.config import config

async def watch_files():
    music_dir = config["music_dir"]
    print(f"Watcher started on {music_dir}", flush=True)

    async for changes in awatch(music_dir):
        for change_type, path in changes:
            if change_type == Change.deleted:
                print(f"Watcher detected deletion: {path}", flush=True)
                delete_file_from_store(path)
            
            elif change_type in (Change.added, Change.modified):
                print(f"Watcher detected update: {path}", flush=True)
                sync_file(path)
