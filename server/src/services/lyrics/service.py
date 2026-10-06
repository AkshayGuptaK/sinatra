from typing import List, Optional
from src.services.lyrics.base import LyricsProvider, LyricsResult
from src.services.lyrics.providers.syncedlyrics import SyncedlyricsProvider


class LyricsService:
    def __init__(self, providers: Optional[List[LyricsProvider]] = None):
        # Default fallback chain: add more providers as needed
        self.providers = providers or [
            SyncedlyricsProvider(),
        ]

    def get_lyrics(self, title: str, artist: str = "") -> Optional[LyricsResult]:
        """Iterates through providers until lyrics are successfully retrieved."""
        for provider in self.providers:
            res = provider.fetch(title=title, artist=artist)
            if res and res.text:
                return res
        return None
