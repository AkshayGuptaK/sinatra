import os
import mimetypes
from pathlib import Path
from datetime import datetime, timezone
from src.sources.base import Source, SourceStat
from src.config import config

mimetypes.init()

class FileSystemSource(Source):
    def __init__(self):
        self.source_dir = config["music_dir"]

    def is_audio_file(filepath: str) -> bool:
        filename = os.path.basename(filepath)

        if filename.startswith('.'):
            return False

        mime_type, _ = mimetypes.guess_type(filepath)

        if mime_type and mime_type.startswith('audio/'):
            return True

        if filename.lower().endswith(('.opus', '.flac', '.m4a', '.mp3', '.wav', '.ogg')):
            return True

        return False

    def get_source_stats(self):
        root = Path(config["music_dir"])
        files = root.rglob(f"*.*")

        return [
            SourceStat(
                location = str(path),
                last_modified_at = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc),
            )
            for path in files
        ]
