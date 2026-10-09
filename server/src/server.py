import shlex
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
from src.pg import get_pg
from src.services import get_tag_suggester


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

MIME_MAP = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
}


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
    filter_type: Optional[str] = Query(
        default=None,
        description="Type of filter constraint: 'column' or 'text'",
    ),
    filter_field: Optional[str] = Query(
        default=None,
        description="Target column if filter_type is 'column' (e.g., 'tags', 'artist', 'mood')",
    ),
    filter_query: Optional[str] = Query(
        default=None,
        description="Filter query term to enforce as a hard boundary",
    ),
    filter_operator: Optional[str] = Query(default=None),
    filter_seconds: Optional[float] = Query(default=None),
):
    """Returns requested number of library tracks similar to the given track,
    excluding those stoplisted, constrained by an optional AutoDJ filter.
    """
    try:
        excluded_ids = []
        if stoplist:
            excluded_ids = [tid.strip() for tid in stoplist.split(",") if tid.strip()]

        db = get_pg()
        tracks = db.get_similar_tracks_except_excluded(
            track_id=track_id,
            excluded_ids=excluded_ids,
            limit=limit,
            filter_type=filter_type,
            filter_field=filter_field,
            filter_query=filter_query,
            filter_operator=filter_operator,
            filter_seconds=filter_seconds,
        )

        return JSONResponse(content=tracks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class SuggestTagsResponse(BaseModel):
    track_id: Optional[str] = None
    existing_tags: List[str] = []
    suggestions: Dict[str, float]


@app.get("/api/suggestions/tags/{track_id}")
async def suggest_tags_for_track(
    track_id: str,
    threshold: float = Query(0.50, ge=0.0, le=1.0, description="Confidence threshold"),
):
    """Suggests tags for an existing track stored in PostgreSQL."""
    db = get_pg()
    track = db.get_track_by_id(track_id)

    if not track:
        raise HTTPException(
            status_code=404,
            detail=f"Track '{track_id}' not found or missing embedding.",
        )

    t_id, raw_tags, raw_emb = track

    if isinstance(raw_tags, list):
        existing = [str(t).strip().lower() for t in raw_tags if str(t).strip()]
    elif isinstance(raw_tags, str):
        existing = [
            t.strip().lower() for t in raw_tags.strip("{}[]").split(",") if t.strip()
        ]
    else:
        existing = []

    suggester = get_tag_suggester()
    try:
        suggestions = suggester.suggest_tags(raw_emb, threshold=threshold)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference error: {str(e)}")

    return SuggestTagsResponse(
        track_id=t_id,
        existing_tags=existing,
        suggestions=suggestions,
    )


@app.get("/api/audio/{track_id}")
async def stream_track(track_id: str):
    """Streams audio for playback."""
    db = get_pg()
    filepath = db.get_track_path_by_id(track_id)
    file_path = Path(filepath) if filepath else None
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    media_type = MIME_MAP.get(file_path.suffix.lower(), "application/octet-stream")
    return FileResponse(
        path=str(file_path),
        media_type=media_type,
        filename=file_path.name,
    )


def extract_query_terms(query_str: str) -> List[str]:
    """Extracts quoted phrases and standalone words using shlex.

    Falls back to whitespace splitting on unbalanced quotes.
    """
    clean = query_str.strip()
    if not clean:
        return []
    try:
        tokens = shlex.split(clean, posix=True)
    except ValueError:
        # Fallback if quotes are unclosed/malformed (e.g. `monologue "night`)
        tokens = clean.replace('"', "").replace("'", "").split()
    return [t.strip() for t in tokens if t.strip()]


class TrackLyricMatchResponse(BaseModel):
    id: str
    matches: List[str]


@app.get(
    "/api/library/lyrics/search",
    response_model=List[TrackLyricMatchResponse],
    summary="Search tracks by lyrics",
)
async def search_library_lyrics(
    q: str = Query(
        ..., min_length=1, description="Lyric query terms or quoted phrases"
    ),
    limit: int = Query(
        default=50, ge=1, le=200, description="Max candidate tracks to inspect"
    ),
):
    """Searches lyrics for words and exact quoted phrases, returning track IDs

    and matching lines for list view presentation.
    """
    try:
        clean_query = q.strip()
        if not clean_query:
            return JSONResponse(content=[])

        terms = extract_query_terms(clean_query)
        if not terms:
            return JSONResponse(content=[])

        db = get_pg()
        results = db.filter_by_lyrics(terms=terms, limit=limit)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
