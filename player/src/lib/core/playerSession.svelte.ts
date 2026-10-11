import { getCurrentWindow } from "@tauri-apps/api/window";
import { getStorageAdapter } from "$lib/stores/localStorage";
import type { Track } from "$lib/types/track";
import type { FilterIntent } from "$lib/utils/commandParser";
import type { MusicPlayer } from "./player.svelte";

export interface PlayerSessionData {
  queueIds: string[];
  currentTrackId: string | null;
  isShuffle: boolean;
  loopMode: "none" | "all" | "one";
  isAutoDj: boolean;
  autoDjConstraint: FilterIntent | null;
}

const SESSION_STORAGE_KEY = "sinatra_player_session";

class PlayerSessionManager {
  private unlistenClose: (() => void) | null = null;

  async loadSession(): Promise<PlayerSessionData | null> {
    return await getStorageAdapter().getItem<PlayerSessionData>(
      SESSION_STORAGE_KEY
    );
  }

  async saveSession(player: MusicPlayer): Promise<void> {
    const payload: PlayerSessionData = {
      queueIds: player.queue.map((t) => t.id),
      currentTrackId: player.currentTrackId,
      isShuffle: player.isShuffle,
      loopMode: player.loopMode,
      isAutoDj: player.isAutoDj,
      autoDjConstraint: player.autoDjConstraint,
    };

    await getStorageAdapter().setItem(SESSION_STORAGE_KEY, payload);
  }

  /**
   * Intercepts window close in Tauri v2, saves session, then destroys the window.
   */
  async setupCloseListener(player: MusicPlayer) {
    if (typeof window === "undefined") return;

    try {
      const appWindow = getCurrentWindow();
      this.unlistenClose = await appWindow.onCloseRequested(async (event) => {
        event.preventDefault();

        try {
          await this.saveSession(player);
        } catch (err) {
          console.error("Failed to save session before close:", err);
        }

        await appWindow.destroy();
      });
    } catch {
      window.addEventListener("beforeunload", () => {
        this.saveSession(player);
      });
    }
  }

  cleanup() {
    this.unlistenClose?.();
  }

  /**
   * Matches stored track IDs against the freshly fetched catalog and restores state.
   */
  rehydrate(player: MusicPlayer, catalog: Track[], session: PlayerSessionData) {
    if (!session || session.queueIds.length === 0) return;

    const trackMap = new Map(catalog.map((t) => [t.id, t]));
    const matchedQueue = session.queueIds
      .map((id) => trackMap.get(id))
      .filter((t): t is Track => t !== undefined);

    if (matchedQueue.length === 0) return;

    player.queue = matchedQueue;
    player.originalQueue = [...matchedQueue];
    player.isShuffle = session.isShuffle;
    player.loopMode = session.loopMode;
    player.isAutoDj = session.isAutoDj;
    player.autoDjConstraint = session.autoDjConstraint;

    const targetIdx = matchedQueue.findIndex(
      (t) => t.id === session.currentTrackId
    );
    player.currentIndex = targetIdx !== -1 ? targetIdx : 0;

    if (player.currentTrackId) {
      player.engine.loadTrack(player.currentTrackId, false);
    }
  }
}

export const playerSession = new PlayerSessionManager();
