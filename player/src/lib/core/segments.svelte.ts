import { sinatraApi } from "$lib/api/sinatra";
import type { TrackSegment } from "$lib/types/track";

const MIN_SEGMENT_DURATION_SEC = 1.0;

export class TrackSegmentManager {
  items = $state<TrackSegment[]>([]);
  isLoading = $state(false);
  isEditing = $state(false);
  error = $state<string | null>(null);

  constructor(
    private getCurrentTrackId: () => string | null,
    private getCurrentTime: () => number,
    private onSeek: (seconds: number) => void
  ) {}

  currentIndex = $derived.by(() => {
    if (this.items.length === 0) return -1;
    const time = this.getCurrentTime();
    return this.items.findIndex(
      (seg) => time >= seg.start_sec && time < seg.end_sec
    );
  });

  current = $derived.by(() => {
    const idx = this.currentIndex;
    return idx !== -1 ? this.items[idx] : null;
  });

  canSplit = $derived.by(() => {
    const seg = this.current;
    if (!seg || this.isEditing || this.isLoading) return false;
    const time = this.getCurrentTime();
    return (
      time - seg.start_sec >= MIN_SEGMENT_DURATION_SEC &&
      seg.end_sec - time >= MIN_SEGMENT_DURATION_SEC
    );
  });

  canPush = $derived.by(() => {
    const idx = this.currentIndex;
    const seg = this.current;
    if (idx <= 0 || !seg || this.isEditing || this.isLoading) return false;
    const prevSeg = this.items[idx - 1];
    const time = this.getCurrentTime();
    return (
      time - prevSeg.start_sec >= MIN_SEGMENT_DURATION_SEC &&
      seg.end_sec - time >= MIN_SEGMENT_DURATION_SEC
    );
  });

  canPull = $derived.by(() => {
    const idx = this.currentIndex;
    const seg = this.current;
    if (
      idx === -1 ||
      idx >= this.items.length - 1 ||
      !seg ||
      this.isEditing ||
      this.isLoading
    ) {
      return false;
    }
    const nextSeg = this.items[idx + 1];
    const time = this.getCurrentTime();
    return (
      time - seg.start_sec >= MIN_SEGMENT_DURATION_SEC &&
      nextSeg.end_sec - time >= MIN_SEGMENT_DURATION_SEC
    );
  });

  async loadForTrack(trackId: string) {
    this.items = [];
    this.isLoading = true;
    this.error = null;

    try {
      const data = await sinatraApi.getTrackSegments(trackId);
      if (this.getCurrentTrackId() === trackId) {
        this.items = data;
      }
    } catch (err) {
      console.error(`Failed to load segments for track ${trackId}:`, err);
      if (this.getCurrentTrackId() === trackId) {
        this.items = [];
        this.error = err instanceof Error ? err.message : String(err);
      }
    } finally {
      if (this.getCurrentTrackId() === trackId) {
        this.isLoading = false;
      }
    }
  }

  clear() {
    this.items = [];
    this.isLoading = false;
    this.isEditing = false;
    this.error = null;
  }

  skipToNext() {
    if (this.items.length === 0) return;
    const time = this.getCurrentTime();
    const next = this.items.find((s) => s.start_sec > time + 0.25);
    if (next) {
      this.onSeek(next.start_sec);
    }
  }

  skipToPrev() {
    if (this.items.length === 0) return;
    const time = this.getCurrentTime();
    const cur = this.current;

    if (cur && time - cur.start_sec > 2.0) {
      this.onSeek(cur.start_sec);
      return;
    }

    const prev = [...this.items]
      .reverse()
      .find((s) => s.end_sec <= time - 0.25);

    if (prev) {
      this.onSeek(prev.start_sec);
    } else {
      this.onSeek(0);
    }
  }

  async editAtCurrentTime(action: "split" | "push" | "pull"): Promise<boolean> {
    const trackId = this.getCurrentTrackId();
    if (!trackId || this.isEditing) return false;

    const timestamp = this.getCurrentTime();
    this.isEditing = true;
    this.error = null;

    try {
      const updated = await sinatraApi.patchTrackSegments(
        trackId,
        action,
        timestamp
      );

      if (this.getCurrentTrackId() === trackId) {
        this.items = updated;
      }
      return true;
    } catch (err) {
      console.error(
        `Failed to ${action} segment at ${timestamp.toFixed(2)}s:`,
        err
      );
      this.error = err instanceof Error ? err.message : String(err);
      return false;
    } finally {
      if (this.getCurrentTrackId() === trackId) {
        this.isEditing = false;
      }
    }
  }

  split = () => this.editAtCurrentTime("split");
  push = () => this.editAtCurrentTime("push");
  pull = () => this.editAtCurrentTime("pull");
}
