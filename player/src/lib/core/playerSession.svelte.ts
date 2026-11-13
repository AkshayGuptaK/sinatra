import { getCurrentWindow } from "@tauri-apps/api/window";
import { getStorageAdapter } from "$lib/stores/localStorage";
import type { LibraryTrack, QueuedTrack } from "$lib/types/track";
import type { FilterIntent } from "$lib/utils/commandParser";
import type { MusicPlayer } from "./player.svelte";

export type SessionQueueItem =
  | { type: "library"; id: string }
  | { type: "remote"; track: QueuedTrack };

export interface PlayerSessionData {
  /** Current queue order (shuffled if isShuffle is true) */
  queueItems: SessionQueueItem[];
  /** Unshuffled queue order so toggling shuffle off after restart works properly */
  originalQueueItems?: SessionQueueItem[];
  currentTrackId: string | null;
  currentIndex?: number;
  isShuffle: boolean;
  loopMode: "none" | "all" | "one";
  isAutoDj: boolean;
  autoDjConstraint: FilterIntent | null;
}

const SESSION_STORAGE_KEY = "sinatra_player_session";

class PlayerSessionManager {
  private unlistenClose: (() => void) | null = null;
  private isClosing = false;

  /**
   * Serializes a track into a minimal SessionQueueItem.
   * Library tracks store only their ID; non-library tracks (with `source`) store their track data.
   */
  private serializeTrack(
    track: QueuedTrack | LibraryTrack
  ): SessionQueueItem | null {
    if (!track || typeof track.id !== "string") return null;

    if ("source" in track && track.source) {
      // Strip any accidental Svelte proxies via plain object reconstruction
      const plainTrack: QueuedTrack = {
        ...track,
        id: track.id,
        title: track.title ?? "Unknown Title",
        artist: track.artist ?? "Unknown Artist",
        album: track.album ?? "",
        start: 0,
        end: Number(track.duration) || 0,
        duration: Number(track.duration) || 0,
        source: track.source,
      };
      return { type: "remote", track: plainTrack };
    }

    return { type: "library", id: track.id };
  }

  /**
   * Resolves a stored list of SessionQueueItems against the library catalog,
   * isolating failures per-item so a single bad entry never breaks the queue.
   */
  private resolveItems(
    items: SessionQueueItem[],
    trackMap: Map<string, LibraryTrack>
  ): QueuedTrack[] {
    const resolved: QueuedTrack[] = [];

    for (const item of items) {
      try {
        if (!item || typeof item !== "object") continue;

        if (item.type === "library") {
          const libTrack = trackMap.get(item.id);
          if (libTrack) {
            resolved.push(libTrack);
          }
        } else if (item.type === "remote" && item.track?.id) {
          // If the user has since synced/downloaded this remote track into the library,
          // prefer the library version; otherwise use the stored QueuedTrack snapshot.
          const syncedTrack = trackMap.get(item.track.id);
          resolved.push(syncedTrack ?? item.track);
        }
      } catch (err) {
        console.warn(
          "[PlayerSession] Skipping malformed queue item:",
          item,
          err
        );
      }
    }

    return resolved;
  }

  async loadSession(): Promise<PlayerSessionData | null> {
    try {
      return await getStorageAdapter().getItem<PlayerSessionData>(
        SESSION_STORAGE_KEY
      );
    } catch (err) {
      console.error(
        "[PlayerSession] Failed to load session from storage:",
        err
      );
      return null;
    }
  }

  async saveSession(player: MusicPlayer): Promise<void> {
    try {
      const queueItems = player.queue
        .map((t) => this.serializeTrack(t))
        .filter((item): item is SessionQueueItem => item !== null);

      const originalQueueSource =
        player.originalQueue && player.originalQueue.length > 0
          ? player.originalQueue
          : player.queue;

      const originalQueueItems = originalQueueSource
        .map((t) => this.serializeTrack(t))
        .filter((item): item is SessionQueueItem => item !== null);

      // Deep-clone constraint via JSON to unwrap any Svelte 5 $state proxies safely
      const safeConstraint = player.autoDjConstraint
        ? JSON.parse(JSON.stringify(player.autoDjConstraint))
        : null;

      const payload: PlayerSessionData = {
        queueItems,
        originalQueueItems,
        currentTrackId: player.currentTrackId ?? null,
        currentIndex: player.currentIndex,
        isShuffle: Boolean(player.isShuffle),
        loopMode: player.loopMode ?? "none",
        isAutoDj: Boolean(player.isAutoDj),
        autoDjConstraint: safeConstraint,
      };

      await getStorageAdapter().setItem(SESSION_STORAGE_KEY, payload);
    } catch (err) {
      console.error("[PlayerSession] Failed to serialize/save session:", err);
    }
  }

  /**
   * Intercepts window close in Tauri v2, saves session, then destroys the window.
   */
  async setupCloseListener(player: MusicPlayer) {
    if (typeof window === "undefined") return;

    this.cleanup();

    try {
      const appWindow = getCurrentWindow();
      this.unlistenClose = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();

        if (this.isClosing) return;
        this.isClosing = true;

        try {
          await this.saveSession(player);
        } catch (err) {
          console.error(
            "[PlayerSession] Failed to save session before close:",
            err
          );
        } finally {
          await appWindow.destroy();
        }
      });
    } catch {
      const handleUnload = () => {
        this.saveSession(player);
      };
      window.addEventListener("beforeunload", handleUnload);
      this.unlistenClose = () =>
        window.removeEventListener("beforeunload", handleUnload);
    }
  }

  cleanup() {
    this.unlistenClose?.();
    this.unlistenClose = null;
    this.isClosing = false;
  }

  /**
   * Matches stored library track IDs against the freshly fetched catalog,
   * restores remote QueuedTracks directly, and rehydrates player state safely.
   */
  rehydrate(
    player: MusicPlayer,
    catalog: LibraryTrack[],
    session: PlayerSessionData | null
  ) {
    if (!session) return;

    const trackMap = new Map(catalog.map((t) => [t.id, t]));

    let rawItems: SessionQueueItem[] = [];
    if (Array.isArray(session.queueItems)) {
      rawItems = session.queueItems;
    }

    if (rawItems.length === 0) return;

    const matchedQueue = this.resolveItems(rawItems, trackMap);
    if (matchedQueue.length === 0) return;

    const matchedOriginalQueue = Array.isArray(session.originalQueueItems)
      ? this.resolveItems(session.originalQueueItems, trackMap)
      : [...matchedQueue];

    player.queue = matchedQueue;
    player.originalQueue =
      matchedOriginalQueue.length > 0
        ? matchedOriginalQueue
        : [...matchedQueue];

    player.isShuffle = Boolean(session.isShuffle);
    player.loopMode = session.loopMode ?? "none";
    player.isAutoDj = Boolean(session.isAutoDj);
    player.autoDjConstraint = session.autoDjConstraint ?? null;

    // Restore active track pointer:
    // 1. If previous currentIndex still points to the same track ID (handles duplicate songs in queue), use it.
    // 2. Otherwise search by currentTrackId.
    // 3. Fallback to index 0.
    let resolvedIdx = -1;
    if (
      typeof session.currentIndex === "number" &&
      session.currentIndex >= 0 &&
      session.currentIndex < matchedQueue.length &&
      matchedQueue[session.currentIndex].id === session.currentTrackId
    ) {
      resolvedIdx = session.currentIndex;
    } else if (session.currentTrackId) {
      resolvedIdx = matchedQueue.findIndex(
        (t) => t.id === session.currentTrackId
      );
    }

    player.currentIndex = resolvedIdx !== -1 ? resolvedIdx : 0;

    // Safely preload the active track into the audio engine without letting
    // a single track/network failure break the restored queue state.
    const activeTrack = player.currentTrack;
    if (activeTrack) {
      try {
        const loadResult = player.engine.loadTrack(
          {
            id: activeTrack.id,
            start:
              "start" in activeTrack && typeof activeTrack.start === "number"
                ? activeTrack.start
                : 0,
            end:
              "end" in activeTrack && typeof activeTrack.end === "number"
                ? activeTrack.end
                : activeTrack.duration ?? 0,
            rms_env: "rms_env" in activeTrack ? activeTrack.rms_env : undefined,
            source: "source" in activeTrack ? activeTrack.source : undefined,
          },
          false
        );

        // Catch asynchronous rejections (e.g., yt-dlp stream resolution or network error)
        if (loadResult instanceof Promise) {
          loadResult.catch((err) => {
            console.warn(
              `[PlayerSession] Failed to preload active track (${activeTrack.id}):`,
              err
            );
          });
        }
      } catch (err) {
        console.warn(
          `[PlayerSession] Error invoking loadTrack for (${activeTrack.id}):`,
          err
        );
      }
    }
  }
}

export const playerSession = new PlayerSessionManager();
