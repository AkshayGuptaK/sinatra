import re
from typing import Optional
from src.services.lyrics.base import LyricsProvider, LyricsResult

try:
    import syncedlyrics
except ImportError:
    syncedlyrics = None


class SyncedlyricsProvider(LyricsProvider):
    @property
    def name(self) -> str:
        return "syncedlyrics"

    def fetch(self, title: str, artist: str = "") -> Optional[LyricsResult]:
        if syncedlyrics is None:
            return None

        search_query = f"{title} {artist}".strip()
        try:
            raw_text = syncedlyrics.search(search_query, plain_only=True)
            if not raw_text or len(raw_text.strip()) < 20:
                return None

            # Clean out any leftover timestamp tags like [01:23.45]
            cleaned = re.sub(r"\[\d{2}:\d{2}\.\d{2,3}\]", "", raw_text).strip()
            return LyricsResult(text=cleaned, source="syncedlyrics")
        except Exception:
            return None