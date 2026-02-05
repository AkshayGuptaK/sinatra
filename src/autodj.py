from src.pg import get_pg
from src.players.mpd import MPDPlayer


class AutoDJ:
    def __init__(self):
        self.player = MPDPlayer()
        self.db = get_pg()

    def _enqueue_similar_track(self):
        current_path = self.player.get_current_song_path()
        if not current_path:
            return

        next_track = self.db.get_similar_track(current_path)

        if next_track:
            print(f"Queueing {next_track}")
            self.player.enqueue([next_track])

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
