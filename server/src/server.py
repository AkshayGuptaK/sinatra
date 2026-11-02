# server/src/server.py
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api import (
    audio_router,
    lyrics_router,
    suggestions_router,
    tracks_router,
)
from src.config import config
from src.sync import sync_store
from src.watcher import watch_files


async def _safety_net_poller():
    while True:
        print("Running periodic sync...")
        await sync_store()
        await asyncio.sleep(config("sync_interval"))


@asynccontextmanager
async def _lifespan(app: FastAPI):
    watcher_task = asyncio.create_task(watch_files())
    poller_task = asyncio.create_task(_safety_net_poller())

    yield

    watcher_task.cancel()
    poller_task.cancel()


app = FastAPI(lifespan=_lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",
        "http://127.0.0.1:1420",
        "tauri://localhost",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges"],
)

app.include_router(tracks_router)
app.include_router(lyrics_router)
app.include_router(suggestions_router)
app.include_router(audio_router)
