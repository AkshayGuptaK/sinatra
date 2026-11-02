from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from src.pg import get_pg
from src.services import get_tag_suggester

router = APIRouter(prefix="/api/suggestions", tags=["suggestions"])


class SuggestTagsResponse(BaseModel):
    track_id: Optional[str] = None
    existing_tags: List[str] = []
    suggestions: Dict[str, float]


@router.get("/tags/{track_id}", response_model=SuggestTagsResponse)
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
