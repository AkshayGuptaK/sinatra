from src.api.audio import router as audio_router
from src.api.explore import router as explore_router
from src.api.lyrics import router as lyrics_router
from src.api.suggestions import router as suggestions_router
from src.api.tracks import router as tracks_router
from src.api.events import router as events_router

__all__ = [
    "audio_router",
    "explore_router",
    "lyrics_router",
    "suggestions_router",
    "tracks_router",
    "events_router",
]
