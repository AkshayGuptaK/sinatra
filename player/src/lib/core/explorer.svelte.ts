import {
  explorerApi,
  type MoodCategoryItem,
  type RemoteAlbum,
  type RemoteAlbumDetails,
  type RemoteArtist,
  type RemoteArtistDetails,
  type RemoteCharts,
  type RemotePlaylist,
  type RemotePlaylistDetails,
  type RemoteTrack,
} from "$lib/api/explore";
import type { SearchIntent } from "$lib/config/commandRegistry";
import { settings } from "./settings.svelte";

export type ExplorerHistoryEntry =
  | { kind: "home" }
  | { kind: "search"; intent: SearchIntent }
  | { kind: "mood"; category: MoodCategoryItem }
  | { kind: "artist"; artistId: string }
  | { kind: "album"; albumId: string }
  | { kind: "playlist"; playlistId: string };

const MAX_HISTORY_SIZE = 50;

export class MusicExplorer {
  sources = $state<string[]>([]);
  activeSource = $state<string>("ytm");
  isInitialized = $state(false);

  moodCategories = $state<Record<string, MoodCategoryItem[]>>({});
  topCharts = $state<RemoteCharts | null>(null);
  isLoading = $state(false);

  activeIntent = $state<SearchIntent>({ type: "song", query: "" });

  tracks = $state<RemoteTrack[]>([]);
  albums = $state<RemoteAlbum[]>([]);
  artists = $state<RemoteArtist[]>([]);
  playlists = $state<RemotePlaylist[]>([]);

  activeCategory = $state<MoodCategoryItem | null>(null);
  activeArtist = $state<RemoteArtistDetails | null>(null);
  activeAlbum = $state<RemoteAlbumDetails | null>(null);
  activePlaylist = $state<RemotePlaylistDetails | null>(null);
  activeCharts = $state<RemoteCharts | null>(null);

  isLoadingSearch = $state(false);
  error = $state<string | null>(null);
  private requestCounter = 0;

  // --- History State ---
  history = $state<ExplorerHistoryEntry[]>([{ kind: "home" }]);
  historyIndex = $state<number>(0);

  canGoBack = $derived(this.historyIndex > 0);
  canGoForward = $derived(this.historyIndex < this.history.length - 1);
  currentEntry = $derived<ExplorerHistoryEntry>(
    this.history[this.historyIndex] ?? { kind: "home" }
  );

  constructor() {
    this.init();
  }

  /**
   * Initializes the explorer by fetching available backend sources,
   * loading mood categories.
   */
  async init(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const availableSources = await explorerApi.getExploreSources();
      this.sources = availableSources;

      if (
        availableSources.length > 0 &&
        !availableSources.includes(this.activeSource)
      ) {
        this.activeSource = availableSources[0];
      }

      await this.loadInitialData();

      this.isInitialized = true;
    } catch (err) {
      console.error("Failed to initialize MusicExplorer:", err);
      this.error =
        err instanceof Error ? err.message : "Failed to initialize explorer";
    }
  }

  /**
   * Switches the active exploration source, resets source-specific history,
   * and refreshes mood categories and the current search intent (if active).
   */
  async setSource(source: string): Promise<void> {
    if (source === this.activeSource || !this.sources.includes(source)) return;
    this.activeSource = source;

    const wasSearching =
      this.currentEntry.kind === "search" &&
      this.activeIntent.query.trim() !== "";

    // Reset history to home since IDs/params are source-specific
    this.history = [{ kind: "home" }];
    this.historyIndex = 0;

    if (wasSearching) {
      await Promise.all([
        this.loadInitialData(),
        this.executeIntent(this.activeIntent, true),
      ]);
    } else {
      this.resetViewData();
      await this.loadInitialData();
    }
  }

  /**
   * Loads mood & genre categories for the active source.
   */
  async loadInitialData(): Promise<void> {
    this.isLoading = true;
    try {
      this.moodCategories = await explorerApi.getExploreMoods(
        this.activeSource
      );
      const country = settings.get("explore.country")
      this.topCharts = await explorerApi.getExploreCharts(this.activeSource, country || "ZZ");
    } catch (err) {
      console.error("Failed to load explore mood categories:", err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Navigates back one step in the explorer history.
   */
  async back(): Promise<void> {
    if (!this.canGoBack) return;
    this.historyIndex -= 1;
    await this.restoreHistoryEntry(this.history[this.historyIndex]);
  }

  /**
   * Navigates forward one step in the explorer history.
   */
  async forward(): Promise<void> {
    if (!this.canGoForward) return;
    this.historyIndex += 1;
    await this.restoreHistoryEntry(this.history[this.historyIndex]);
  }

  /**
   * Returns to the home/landing view (moods & top charts).
   */
  goHome = (): void => {
    this.requestCounter++;
    this.isLoadingSearch = false;
    this.error = null;
    this.resetViewData();
    this.pushHistory({ kind: "home" });
  };

  /**
   * Core dispatcher that resolves any SearchIntent against explorerApi.
   */
  async executeIntent(
    intent: SearchIntent,
    recordHistory = true
  ): Promise<void> {
    const currentRequestId = ++this.requestCounter;

    this.activeIntent = { ...intent };
    this.isLoadingSearch = true;
    this.error = null;

    if (recordHistory) {
      this.pushHistory({ kind: "search", intent: { ...intent } });
    }

    try {
      let results = [];
      switch (intent.type) {
        case "mood": {
          const category = Object.values(this.moodCategories)
            .flatMap((arr) => arr)
            .find(
              (cat) => cat.title.toLowerCase() === intent.query.toLowerCase()
            );
          if (!category) return;
          results = await explorerApi.getExploreMoodPlaylists(
            this.activeSource,
            category.params
          );
          break;
        }
        default: {
          results = await explorerApi.searchExplore(this.activeSource, {
            query: intent.query,
            filter: intent.type,
            limit: 30,
          });
        }
      }

      if (currentRequestId !== this.requestCounter) return;
      this.resetViewData();

      for (const item of results) {
        if (
          item.result_type === "song" ||
          item.result_type === "video" ||
          "video_id" in item
        ) {
          this.tracks.push(item as RemoteTrack);
        } else if (item.result_type === "album") {
          this.albums.push(item as RemoteAlbum);
        } else if (item.result_type === "artist") {
          this.artists.push(item as RemoteArtist);
        } else if (item.result_type === "playlist") {
          this.playlists.push(item as RemotePlaylist);
        }
      }
    } catch (err) {
      if (currentRequestId !== this.requestCounter) return;
      console.error("MusicExplorer intent failed:", err);
      this.error =
        err instanceof Error ? err.message : "Failed to load explore results";
    } finally {
      if (currentRequestId === this.requestCounter) {
        this.isLoadingSearch = false;
      }
    }
  }

  async download(trackId: string) {
    try {
      await explorerApi.downloadTrack(this.activeSource, trackId);
    } catch (err) {
      console.error("Track download failed:", err);
    }
  }

  exploreMood = async (category: MoodCategoryItem, recordHistory = true) => {
    const currentRequestId = ++this.requestCounter;
    this.isLoadingSearch = true;
    this.error = null;

    if (recordHistory) {
      this.pushHistory({ kind: "mood", category });
    }

    try {
      this.resetViewData();
      this.activeCategory = category;
      const playlists = await explorerApi.getExploreMoodPlaylists(
        this.activeSource,
        category.params
      );
      if (currentRequestId !== this.requestCounter) return;
      this.playlists = playlists;
    } catch (err) {
      if (currentRequestId !== this.requestCounter) return;
      console.error("Mood playlists couldn't be fetched", err);
    } finally {
      if (currentRequestId === this.requestCounter) {
        this.isLoadingSearch = false;
      }
    }
  };

  exploreArtist = async (artistId: string, recordHistory = true) => {
    const currentRequestId = ++this.requestCounter;
    this.isLoadingSearch = true;
    this.error = null;

    if (recordHistory) {
      this.pushHistory({ kind: "artist", artistId });
    }

    try {
      this.resetViewData();
      const artist = await explorerApi.getExploreArtist(
        this.activeSource,
        artistId
      );
      if (currentRequestId !== this.requestCounter) return;
      this.activeArtist = artist;
    } catch (err) {
      if (currentRequestId !== this.requestCounter) return;
      console.error("Artist details couldn't be fetched", err);
    } finally {
      if (currentRequestId === this.requestCounter) {
        this.isLoadingSearch = false;
      }
    }
  };

  exploreAlbum = async (albumId: string, recordHistory = true) => {
    const currentRequestId = ++this.requestCounter;
    this.isLoadingSearch = true;
    this.error = null;

    if (recordHistory) {
      this.pushHistory({ kind: "album", albumId });
    }

    try {
      this.resetViewData();
      const album = await explorerApi.getExploreAlbum(
        this.activeSource,
        albumId
      );
      if (currentRequestId !== this.requestCounter) return;
      this.activeAlbum = album;
    } catch (err) {
      if (currentRequestId !== this.requestCounter) return;
      console.error("Album details couldn't be fetched", err);
    } finally {
      if (currentRequestId === this.requestCounter) {
        this.isLoadingSearch = false;
      }
    }
  };

  explorePlaylist = async (playlistId: string, recordHistory = true) => {
    const currentRequestId = ++this.requestCounter;
    this.isLoadingSearch = true;
    this.error = null;

    if (recordHistory) {
      this.pushHistory({ kind: "playlist", playlistId });
    }

    try {
      this.resetViewData();
      const playlist = await explorerApi.getExplorePlaylist(
        this.activeSource,
        playlistId
      );
      if (currentRequestId !== this.requestCounter) return;
      this.activePlaylist = playlist;
    } catch (err) {
      if (currentRequestId !== this.requestCounter) return;
      console.error("Playlist details couldn't be fetched", err);
    } finally {
      if (currentRequestId === this.requestCounter) {
        this.isLoadingSearch = false;
      }
    }
  };

  /**
   * Truncates any forward history after `historyIndex` and appends the new entry,
   * skipping consecutive identical navigations.
   */
  private pushHistory(entry: ExplorerHistoryEntry): void {
    const current = this.history[this.historyIndex];
    if (current && this.isSameEntry(current, entry)) {
      return;
    }

    // Truncate forward history
    const nextHistory = this.history.slice(0, this.historyIndex + 1);
    nextHistory.push(entry);

    // Cap history size to prevent unbounded growth
    if (nextHistory.length > MAX_HISTORY_SIZE) {
      nextHistory.shift();
    }

    this.history = nextHistory;
    this.historyIndex = this.history.length - 1;
  }

  /**
   * Re-applies a historical navigation entry without pushing a new entry.
   */
  private async restoreHistoryEntry(
    entry: ExplorerHistoryEntry
  ): Promise<void> {
    switch (entry.kind) {
      case "home":
        this.requestCounter++;
        this.isLoadingSearch = false;
        this.error = null;
        this.resetViewData();
        break;
      case "search":
        await this.executeIntent(entry.intent, false);
        break;
      case "mood":
        await this.exploreMood(entry.category, false);
        break;
      case "artist":
        await this.exploreArtist(entry.artistId, false);
        break;
      case "album":
        await this.exploreAlbum(entry.albumId, false);
        break;
      case "playlist":
        await this.explorePlaylist(entry.playlistId, false);
        break;
    }
  }

  private isSameEntry(
    a: ExplorerHistoryEntry,
    b: ExplorerHistoryEntry
  ): boolean {
    if (a.kind !== b.kind) return false;
    switch (a.kind) {
      case "home":
        return true;
      case "search":
        return (
          b.kind === "search" &&
          a.intent.type === b.intent.type &&
          a.intent.query === b.intent.query
        );
      case "mood":
        return b.kind === "mood" && a.category.params === b.category.params;
      case "artist":
        return b.kind === "artist" && a.artistId === b.artistId;
      case "album":
        return b.kind === "album" && a.albumId === b.albumId;
      case "playlist":
        return b.kind === "playlist" && a.playlistId === b.playlistId;
    }
  }

  private resetViewData(): void {
    this.tracks = [];
    this.albums = [];
    this.artists = [];
    this.playlists = [];
    this.activeCategory = null;
    this.activeArtist = null;
    this.activeAlbum = null;
    this.activePlaylist = null;
    this.activeCharts = null;
  }
}

export const explorer = new MusicExplorer();
