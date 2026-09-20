from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from pathlib import Path
import asyncio
from contextlib import asynccontextmanager
from src.config import config
from src.sync import sync_store
from src.watcher import watch_files
from src.autodj import AutoDJ
from src.visualizer import fetch_library_map_points, fetch_library_path, render_map_page_html

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


@app.get("/api/map/audio/{track_id}")
async def stream_track(track_id: str):
    """Streams audio for playback."""
    file_path = fetch_library_path(track_id)
    return FileResponse(
        path=file_path,
        media_type="audio/mpeg" if Path(file_path).suffix.lower() == ".mp3" else None,
        filename=file_path
    )
