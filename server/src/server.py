from typing import Dict, List, Optional, Any
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import asyncio
from contextlib import asynccontextmanager
from src.config import config
from src.sync import sync_store
from src.watcher import watch_files
from src.autodj import AutoDJ
from src.visualizer import (
    fetch_library_map_points,
    fetch_library_path,
    render_map_page_html,
)
from src.pg import get_pg

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


@asynccontextmanager
async def _lifespan(app: FastAPI):
    watcher_task = asyncio.create_task(watch_files())
    poller_task = asyncio.create_task(_safety_net_poller())
    dj_task = asyncio.create_task(_autodj_poller())

    yield

    watcher_task.cancel()
    poller_task.cancel()
    dj_task.cancel()


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


@app.get("/map", response_class=HTMLResponse)
async def get_library_map():
    """Serves the interactive 2D emotion explorer UI."""
    return HTMLResponse(content=render_map_page_html())


@app.get("/api/map/data")
async def get_library_map_data():
    """Returns the dynamic coordinates and mood summaries for all projected tracks."""
    try:
        points = fetch_library_map_points()
        return JSONResponse(content=points)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/library/tracks")
async def get_library_tracks():
    """Returns all library tracks with metadata."""
    try:
        db = get_pg()
        tracks = db.get_all_tracks()
        return JSONResponse(content=tracks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class TrackMetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[List[str]] = None


def sanitize_tags(raw_tags: List[str]) -> List[str]:
    """Trims whitespace, lowercases, removes blanks, and deduplicates while preserving order."""
    cleaned = []
    seen = set()
    for tag in raw_tags:
        t = tag.strip().lower()
        if t and t not in seen:
            seen.add(t)
            cleaned.append(t)
    return sorted(cleaned)


@app.patch("/api/library/tracks/{track_id}")
async def update_track(track_id: str, payload: TrackMetadataUpdate):
    """Updates editable metadata attributes for a given track."""
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return {"status": "noop"}

    if "tags" in updates and updates["tags"] is not None:
        updates["tags"] = sanitize_tags(updates["tags"])

    db = get_pg()
    success = db.update_track_metadata(track_id, updates)
    if not success:
        raise HTTPException(status_code=500, detail="Failed to update track metadata.")

    return {"status": "success", "updated": updates}


@app.get("/api/library/tracks/similar/{track_id}")
async def get_similar_library_tracks(
    track_id: str,
    stoplist: Optional[str] = Query(
        default=None,
        description="Comma-separated track IDs to exclude from recommendations",
    ),
    limit: int = Query(default=5, ge=1, le=50),
):
    """Returns requested number of library tracks similar to the given track,

    excluding those stoplisted or already in the queue.
    """
    try:
        excluded_ids = []
        if stoplist:
            excluded_ids = [tid.strip() for tid in stoplist.split(",") if tid.strip()]

        db = get_pg()
        tracks = db.get_similar_tracks_except_excluded(
            track_id=track_id, excluded_ids=excluded_ids, limit=limit
        )

        return JSONResponse(content=tracks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/audio/{track_id}")
async def stream_track(track_id: str):
    """Streams audio for playback."""
    file_path = fetch_library_path(track_id)
    return FileResponse(
        path=file_path,
        media_type="audio/mpeg" if Path(file_path).suffix.lower() == ".mp3" else None,
        filename=file_path,
    )
