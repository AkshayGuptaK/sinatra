from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, StreamingResponse
from src.pg import get_pg
from src.api.utils import resolve_explorer

router = APIRouter(prefix="/api/audio", tags=["audio"])

MIME_MAP = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".opus": "audio/ogg",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
    ".wav": "audio/wav",
}


@router.get("/{track_id}")
def stream_track(
    track_id: str,
    request: Request,
    source: Optional[str] = Query(
        default=None,
        description="Audio source provider (e.g. 'local', 'ytm'). Defaults to local library.",
    ),
):
    """Streams audio for playback from either the local filesystem or a remote explorer source."""
    if not source or source.strip().lower() in ("local", "file"):
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

    explorer = resolve_explorer(source)
    range_header = request.headers.get("range")

    try:
        chunks, status_code, headers = explorer.iter_audio_chunks(
            track_id, range_header=range_header
        )
        return StreamingResponse(
            chunks,
            status_code=status_code,
            headers=headers,
            media_type=headers.get("Content-Type", "audio/webm"),
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to stream audio from source '{source}': {e}",
        )
