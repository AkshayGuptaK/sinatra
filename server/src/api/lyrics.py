import shlex
from typing import List
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from src.pg import get_pg

router = APIRouter(prefix="/api/library", tags=["lyrics"])


class TrackLyricMatchResponse(BaseModel):
    id: str
    matches: List[str]


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
        tokens = clean.replace('"', "").replace("'", "").split()
    return [t.strip() for t in tokens if t.strip()]


@router.get("/tracks/{track_id}/lyrics")
async def get_track_lyrics(track_id: str):
    """Fetches full lyrics text for a single track."""
    db = get_pg()
    lyrics = db.get_track_lyrics(track_id)
    if not lyrics:
        raise HTTPException(status_code=404, detail="Track not found")
    return {"lyrics": lyrics}


@router.get(
    "/lyrics/search",
    response_model=List[TrackLyricMatchResponse],
    summary="Search tracks by lyrics",
)
async def search_library_lyrics(
    q: str = Query(..., min_length=1, description="Lyric query terms or quoted phrases")
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
        results = db.filter_by_lyrics(terms=terms)
        return JSONResponse(content=results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
