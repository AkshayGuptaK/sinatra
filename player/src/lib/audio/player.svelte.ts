import { AudioEngine } from "./engine.svelte";
import { sinatraApi } from "$lib/api/sinatra";
import { type Track } from "$lib/types/track";

export type LoopMode = "none" | "one" | "all";

export class MusicPlayer {
  readonly engine: AudioEngine;

  // Reactive Queue State
  queue = $state<Track[]>([]);
  currentIndex = $state<number>(-1);
  isAutoDj = $state(false);
  isFetchingAutoDj = $state(false);
  isShuffle = $state(false);
  loopMode = $state<LoopMode>("none");

  // Internal record to restore queue order when un-shuffling
  private originalQueue: Track[] = [];

  currentTrack = $derived(
    this.currentIndex >= 0 && this.currentIndex < this.queue.length
      ? this.queue[this.currentIndex]
      : null
  );

  currentTrackId = $derived(this.currentTrack?.id ?? null);

  hasNext = $derived(
    this.loopMode === "all"
      ? this.queue.length > 0
      : this.currentIndex < this.queue.length - 1
  );
  hasPrevious = $derived(
    this.loopMode === "all" ? this.queue.length > 0 : this.currentIndex > 0
  );

  constructor() {
    this.engine = new AudioEngine();
    this.engine.onTrackEnded = () => this.handleTrackEnded();
  }

  private handleTrackEnded() {
    if (this.hasNext) {
      this.next();
    } else {
      this.engine.pause();
    }
  }

  setQueue(tracks: Track[], startIndex = 0, autoPlay = true) {
    this.originalQueue = [...tracks];
    this.queue = [...tracks];
    this.currentIndex = startIndex;

    if (this.isShuffle) {
      this.applyShuffleOrder(startIndex);
    }

    const currentId = this.currentTrackId;
    if (currentId) {
      this.engine.loadTrack(currentId, autoPlay);
    }
  }

  clearQueue() {
    this.originalQueue = [];
    this.queue = [];
    this.currentIndex = -1;
    this.engine.pause();
    this.engine.seekTo(0);
  }

  /**
   * Checks if the currently active track is the last track in the queue,
   * and if so, fetches and enqueues more tracks via the backend.
   */
  async checkAndTriggerAutoDj() {
    if (!this.isAutoDj || this.isFetchingAutoDj) return;

    // Trigger only if we have an active track and it's the last one in the queue
    const isLastTrack =
      this.currentIndex >= 0 && this.currentIndex === this.queue.length - 1;

    if (!isLastTrack || !this.currentTrackId) return;

    try {
      this.isFetchingAutoDj = true;

      // Collect all track IDs currently in the queue to avoid repeats
      const currentQueueIds = this.queue.map((t) => t.id);

      const similarTracks = await sinatraApi.getSimilarTracks(
        this.currentTrackId,
        currentQueueIds
      );

      if (similarTracks && similarTracks.length > 0) {
        for (const track of similarTracks) {
          this.enqueue(track);
        }
      }
    } catch (err) {
      console.error("Auto DJ failed to fetch recommendations:", err);
    } finally {
      this.isFetchingAutoDj = false;
    }
  }

  enqueue(track: Track) {
    this.originalQueue.push(track);
    this.queue.push(track);

    // If nothing is playing, kick off playback with the new track
    if (this.currentIndex === -1) {
      this.currentIndex = 0;
      this.engine.loadTrack(track.id, true);
      this.checkAndTriggerAutoDj();
    }
  }

  removeTrackAtIndex(index: number) {
    if (index < 0 || index >= this.queue.length) return;

    const [removed] = this.queue.splice(index, 1);

    if (removed) {
      const origIdx = this.originalQueue.findIndex((t) => t.id === removed.id);
      if (origIdx !== -1) {
        this.originalQueue.splice(origIdx, 1);
      }
    }

    if (this.queue.length === 0) {
      this.clearQueue();
    } else if (index === this.currentIndex) {
      if (this.currentIndex >= this.queue.length) {
        this.currentIndex = this.queue.length - 1;
      }
      this.playTrackAtIndex(this.currentIndex);
    } else if (index < this.currentIndex) {
      this.currentIndex -= 1;
    }
    this.checkAndTriggerAutoDj();
  }

  async playTrackAtIndex(index: number) {
    if (index < 0 || index >= this.queue.length) return;
    this.currentIndex = index;
    const track = this.queue[index];
    await this.engine.loadTrack(track.id, true);
    this.checkAndTriggerAutoDj();
  }

  async next() {
    if (this.queue.length === 0) return;

    if (this.currentIndex + 1 < this.queue.length) {
      await this.playTrackAtIndex(this.currentIndex + 1);
    } else if (this.loopMode === "all") {
      await this.playTrackAtIndex(0);
    }
  }

  async previous() {
    if (this.queue.length === 0) return;

    // If track has been playing for > 3s, restart track rather than jump backward
    if (this.engine.currentTime > 3) {
      this.engine.seekTo(0);
      return;
    }

    if (this.currentIndex > 0) {
      await this.playTrackAtIndex(this.currentIndex - 1);
    } else if (this.loopMode === "all") {
      await this.playTrackAtIndex(this.queue.length - 1);
    } else {
      this.engine.seekTo(0);
    }
  }

  toggleShuffle() {
    this.isShuffle = !this.isShuffle;

    if (this.queue.length <= 1) return;

    const activeTrack = this.currentTrack;

    if (this.isShuffle) {
      this.applyShuffleOrder(this.currentIndex);
    } else {
      // Restore original queue order while keeping active index in sync
      this.queue = [...this.originalQueue];
      this.currentIndex = activeTrack
        ? this.queue.findIndex((track) => track.id === activeTrack.id)
        : 0;
    }
  }

  toggleAutoDj() {
    this.isAutoDj = !this.isAutoDj;

    if (this.isAutoDj) {
      this.checkAndTriggerAutoDj();
    }
  }

  private applyShuffleOrder(preserveIndex: number) {
    const activeTrack = this.queue[preserveIndex];
    const remaining = this.queue.filter((_, i) => i !== preserveIndex);

    // Fisher-Yates shuffle on remaining tracks
    for (let i = remaining.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
    }

    this.queue = activeTrack ? [activeTrack, ...remaining] : remaining;
    this.currentIndex = 0;
  }

  setLoopMode(mode: LoopMode) {
    this.loopMode = mode;
    this.engine.setLoop(mode === "one");
  }

  cycleLoopMode() {
    const modes: LoopMode[] = ["none", "all", "one"];
    const nextIdx = (modes.indexOf(this.loopMode) + 1) % modes.length;
    this.setLoopMode(modes[nextIdx]);
  }
}

// Global player singleton instance
export const player = new MusicPlayer();
