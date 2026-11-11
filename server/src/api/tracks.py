from typing import List, Literal, Optional
from fastapi import APIRouter, HTTPException, Query, Depends
from fastapi.responses import JSONResponse
from dataclasses import asdict, is_dataclass
from datetime import datetime
from pydantic import BaseModel, Field
from src.pg import get_pg
from src.services.segment_editor import edit_track_segments
from src.services.explore import MusicExplorer
from src.api.utils import resolve_explorer

router = APIRouter(prefix="/api/library/tracks", tags=["tracks"])


class TrackMetadataUpdate(BaseModel):
    title: Optional[str] = None
    artist: Optional[str] = None
    album: Optional[str] = None
    mood: Optional[str] = None
    tags: Optional[List[str]] = None
    lyrics: Optional[str] = None


class SegmentEditPayload(BaseModel):
    action: Literal["split", "push", "pull"]
    timestamp: float = Field(
        ...,
        ge=0.0,
        description="Audio timestamp in seconds to apply the split boundary modification",
    )


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


@router.get("")
async def get_library_tracks(since: Optional[datetime] = None):
    """Returns all library tracks with metadata."""
    try:
        db = get_pg()
        tracks = db.get_all_tracks(since)
        return JSONResponse(content=tracks)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{track_id}")
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


@router.get("/{track_id}/segments")
async def get_track_segments(track_id: str):
    """Returns ordered segment slices for a track with start/end timestamps
    and emotion distributions.
    """
    try:
        db = get_pg()
        segments = db.get_track_segments(track_id)
        if len(segments) == 0:
            raise HTTPException(
                status_code=404, detail=f"Segments not found for track {track_id}"
            )
        return JSONResponse(content=segments)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{track_id}/segments")
async def patch_track_segments(track_id: str, payload: SegmentEditPayload):
    """Partially updates a track's segment collection via split, push, or pull,
    recalculates affected embeddings, and returns refreshed segments.
    """
    try:
        updated_segments = edit_track_segments(
            track_id=track_id,
            action=payload.action,
            timestamp=payload.timestamp,
        )
        return JSONResponse(content=updated_segments)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{source}/similar/{track_id}")
async def get_similar_library_tracks(
    source: str,
    track_id: str,
    mode: str = Query(
        default="acoustics",
        description="Similarity space: 'acoustics' (timbre/sound) or 'acoustic_emotion' (affective mood)",
    ),
    stoplist: Optional[str] = Query(
        default=None,
        description="Comma-separated track IDs to exclude from recommendations",
    ),
    limit: int = Query(default=5, ge=1, le=50),
    include_segments: bool = Query(
        default=False, description="Whether to include track segments in search"
    ),
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
    explorer: MusicExplorer = Depends(resolve_explorer),
):
    """Returns requested number of tracks similar to the given track.

    Dispatches to YouTube Music radio when source='ytm', or the local PostgreSQL
    vector similarity engine when source='local'.
    """
    try:
        excluded_ids: list[str] = []
        if stoplist:
            excluded_ids = [tid.strip() for tid in stoplist.split(",") if tid.strip()]

        # ---------------------------------------------------------------------
        # 1. YouTube Music Recommendations
        # ---------------------------------------------------------------------
        if source.strip().lower() == "ytm":
            # Request extra tracks if a stoplist is present to guarantee fulfilling 'limit'
            fetch_limit = limit + len(excluded_ids)
            remote_tracks: list[RemoteTrack] = explorer.get_song_recommendations(
                video_id=track_id, limit=fetch_limit
            )

            stop_set = set(excluded_ids)
            stop_set.add(track_id)

            filtered_recs: list[dict] = []
            for t in remote_tracks:
                vid = getattr(t, "video_id", None) or (
                    t.get("video_id") if isinstance(t, dict) else None
                )
                if vid and vid in stop_set:
                    continue

                if hasattr(t, "to_dict"):
                    filtered_recs.append(t.to_dict())
                elif is_dataclass(t):
                    filtered_recs.append(asdict(t))
                elif isinstance(t, dict):
                    filtered_recs.append(t)

                if len(filtered_recs) == limit:
                    break

            return JSONResponse(content=filtered_recs)

        # ---------------------------------------------------------------------
        # 2. Local Library (PostgreSQL + pgvector)
        # ---------------------------------------------------------------------
        db = get_pg()
        tracks = db.get_similar_tracks_except_excluded(
            track_id=track_id,
            similarity_mode=mode,
            excluded_ids=excluded_ids,
            limit=limit,
            include_segments=include_segments,
            filter_type=filter_type,
            filter_field=filter_field,
            filter_query=filter_query,
            filter_operator=filter_operator,
            filter_seconds=filter_seconds,
        )

        return JSONResponse(content=tracks)

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        print("erorr is", e)
        raise HTTPException(status_code=500, detail=str(e))
