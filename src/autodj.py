import os
from src.pg import get_pg
from src.players.mpd import MPDPlayer
from src.config import config


class AutoDJ:
    def __init__(self):
        self.player = MPDPlayer()
        self.db = get_pg()

    def _enqueue_similar_track(self):
        music_root = "/Users/akshay/Music"  # change to config["music_dir"] later once entire library ingested
        relative_path = self.player.get_current_song_path()
        if not relative_path:
            return
        current_abs_path = os.path.join(music_root, relative_path)

        next_track_abs = self.db.get_similar_track(current_abs_path)

        if next_track_abs:
            next_track_rel = os.path.relpath(next_track_abs, music_root)
            print(f"Queueing {next_track_rel}")
            self.player.enqueue([next_track_rel])

    def check_and_queue(self):
        """
        Checks if the MPD queue is empty or near empty.
        If playing the last song, enqueues a similar one.
        """
        status = self.player.get_status()
        if status["state"] != "play":
            return

        current_index = int(status.get("song", -1))
        queue_length = int(status.get("playlistlength", 0))
        playing_last_song = current_index >= queue_length - 1

        if playing_last_song:
            self._enqueue_similar_track()
