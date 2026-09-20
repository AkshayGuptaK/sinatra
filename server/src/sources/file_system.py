import os
import mimetypes
import subprocess
from pathlib import Path
from datetime import datetime, timezone
import torch
import numpy as np
from src.sources.base import Source, SourceStat
from src.config import config

mimetypes.init()


class FileSystemSource(Source):
    def __init__(self):
        self.source_dir = config["music_dir"]

    def is_audio_file(filepath: str) -> bool:
        filename = os.path.basename(filepath)

        if filename.startswith("."):
            return False

        mime_type, _ = mimetypes.guess_type(filepath)

        if mime_type and mime_type.startswith("audio/"):
            return True

        if filename.lower().endswith(
            (".opus", ".flac", ".m4a", ".mp3", ".wav", ".ogg")
        ):
            return True

        return False

    def get_source_stats(self):
        root = Path(config["music_dir"])
        files = root.rglob(f"*.*")

        return [
            SourceStat(
                location=str(path),
                last_modified_at=datetime.fromtimestamp(
                    path.stat().st_mtime, tz=timezone.utc
                ),
            )
            for path in files
        ]

    # TODO: refactor this and below method read_bytes
    def read_file(filepath, target_sr=44100, channels=2):
        """
        Robustly loads any audio file using system FFmpeg.
        - channels: 1 for Mono, 2 for Stereo
        """
        cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            filepath,
            "-f",
            "f32le",  # PCM Float32
            "-ac",
            str(channels),
            "-ar",
            str(target_sr),
            "-",  # Pipe to stdout
        ]

        try:
            process = subprocess.Popen(
                cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE
            )
            stdout, stderr = process.communicate()

            if process.returncode != 0 or len(stdout) == 0:
                # Only print actual errors, ignore minor warnings if we got data
                if len(stdout) == 0:
                    print(f"FFmpeg failed for {Path(filepath).name}: {stderr.decode()}")
                    return None

            # 1. Read raw bytes to numpy
            audio_np = np.frombuffer(stdout, dtype=np.float32).copy()

            # 2. Reshape to (Channels, Time)
            # FFmpeg outputs interleaved data: [L, R, L, R...]
            if channels > 1:
                audio_np = audio_np.reshape(-1, channels).T  # -> (2, Samples)
            else:
                audio_np = audio_np.reshape(1, -1)  # -> (1, Samples)

            return torch.from_numpy(audio_np)

        except Exception as e:
            print(f"Load Error: {e}")
            return None

    @staticmethod
    def read_bytes(
        audio_bytes: bytes, target_sr: int = 44100, channels: int = 2
    ) -> torch.Tensor | None:
        cmd = [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            "pipe:0",
            "-f",
            "f32le",
            "-ac",
            str(channels),
            "-ar",
            str(target_sr),
            "-",
        ]
        try:
            proc = subprocess.Popen(
                cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            stdout, stderr = proc.communicate(input=audio_bytes)
            if proc.returncode != 0 or len(stdout) == 0:
                return None

            audio_np = np.frombuffer(stdout, dtype=np.float32).copy()
            if channels > 1:
                audio_np = audio_np.reshape(-1, channels).T
            else:
                audio_np = audio_np.reshape(1, -1)

            return torch.from_numpy(audio_np)
        except Exception as e:
            print(f"FFmpeg pipe decode error: {e}")
            return None
