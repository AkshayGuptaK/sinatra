from mpd import MPDClient, ConnectionError
from .base import MusicPlayer


class MPDPlayer(MusicPlayer):
    def __init__(self, host: str = "host.docker.internal", port: int = 6600):
        self.host = host
        self.port = port
        self.client = MPDClient()
        self.client.timeout = 10

    def _ensure_connected(self):
        try:
            self.client.ping()
        except (ConnectionError, Exception):
            self.client.connect(self.host, self.port)

    def play(self, filepaths):
        self._ensure_connected()
        self.client.clear()
        for path in filepaths:
            # MPD expects paths relative to its music root
            self.client.add(path)
        self.client.play()

    def enqueue(self, filepaths):
        self._ensure_connected()
        for path in filepaths:
            self.client.add(path)

    def get_status(self):
        self._ensure_connected()
        status = self.client.status()
        return {
            "state": status.get("state", "unknown"),
            "volume": int(status.get("volume", 0)),
            "elapsed": float(status.get("elapsed", 0.0)),
            "bitrate": int(status.get("bitrate")) if status.get("bitrate") else None,
        }
