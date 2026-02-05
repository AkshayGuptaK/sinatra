from fastapi import FastAPI
import asyncio
from contextlib import asynccontextmanager
from src.config import config
from src.sync import sync_store
from src.watcher import watch_files
from src.players import *
from src.autodj import AutoDJ

autodj = AutoDJ()


async def _safety_net_poller():
    while True:
        print("Running periodic sync...")
        await sync_store()
        await asyncio.sleep(config("sync_interval"))


async def _autodj_poller():
    while True:
        try:
            autodj.check_and_queue()
        except Exception as e:
            print(f"AutoDJ failed: {e}")
        await asyncio.sleep(10)


async def _run_test_playback():
    print("--- Startup: Triggering Test Playback ---")
    try:
        mpd = MPDPlayer()
        mpd.play(["Lofi/Still Cold.opus"])
    except Exception as e:
        print(f"Startup playback failed: {e}")


@asynccontextmanager
async def _lifespan(app: FastAPI):
    watcher_task = asyncio.create_task(watch_files())
    poller_task = asyncio.create_task(_safety_net_poller())
    dj_task = asyncio.create_task(_autodj_poller())

    asyncio.create_task(_run_test_playback())

    yield

    watcher_task.cancel()
    poller_task.cancel()
    dj_task.cancel()


app = FastAPI(lifespan=_lifespan)
