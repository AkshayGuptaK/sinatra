from fastapi import Path
from src.services.explore import MusicExplorer, get_explorer


def resolve_explorer(
    source: str = Path(..., description="Explore provider ID (e.g. 'ytm', 'spotify')")
) -> MusicExplorer:
    try:
        return get_explorer(source)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
