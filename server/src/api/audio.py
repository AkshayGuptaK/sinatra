from pathlib import Path
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from src.pg import get_pg

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
