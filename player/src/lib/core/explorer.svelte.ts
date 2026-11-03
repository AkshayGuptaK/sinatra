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
import type { SearchIntent } from "$lib/utils/commandParser";

export class MusicExplorer {
  sources = $state<string[]>([]);
  activeSource = $state<string>("ytm");
  isInitialized = $state(false);

  moodCategories = $state<MoodCategoryItem[]>([]);
  isLoadingMoods = $state(false);

  activeIntent = $state<SearchIntent>({ type: "song", query: "" });

  tracks = $state<RemoteTrack[]>([]);
  albums = $state<RemoteAlbum[]>([]);
  artists = $state<RemoteArtist[]>([]);
  playlists = $state<RemotePlaylist[]>([]);

  activeArtist = $state<RemoteArtistDetails | null>(null);
  activeAlbum = $state<RemoteAlbumDetails | null>(null);
  activePlaylist = $state<RemotePlaylistDetails | null>(null);
  activeCharts = $state<RemoteCharts | null>(null);

  isLoading = $state(false);
  error = $state<string | null>(null);
  private requestCounter = 0;

  constructor() {
    this.init();
  }

  /**
   * Initializes the explorer by fetching available backend sources,
   * loading mood categories, and running the default initial intent (Global Charts).
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

      await Promise.all([
        this.loadMoodCategories(),
        this.executeIntent(this.activeIntent),
      ]);

      this.isInitialized = true;
    } catch (err) {
      console.error("Failed to initialize MusicExplorer:", err);
      this.error =
        err instanceof Error ? err.message : "Failed to initialize explorer";
    }
  }

  /**
   * Switches the active exploration source (e.g., 'ytm' -> 'spotify')
   * and refreshes mood categories and the current intent.
   */
  async setSource(source: string): Promise<void> {
    if (source === this.activeSource || !this.sources.includes(source)) return;
    this.activeSource = source;
    await Promise.all([
      this.loadMoodCategories(),
      this.executeIntent(this.activeIntent),
    ]);
  }

  /**
   * Loads mood & genre categories for the active source.
   */
  async loadMoodCategories(): Promise<void> {
    this.isLoadingMoods = true;
    try {
      this.moodCategories = await explorerApi.getExploreMoods(
        this.activeSource
      );
    } catch (err) {
      console.error("Failed to load explore mood categories:", err);
      this.moodCategories = [];
    } finally {
      this.isLoadingMoods = false;
    }
  }

  /**
   * Core dispatcher that resolves any SearchIntent against explorerApi.
   */
  async executeIntent(intent: SearchIntent): Promise<void> {
    const currentRequestId = ++this.requestCounter;

    this.isLoading = true;
    this.error = null;

    try {
      let results = [];
      switch (intent.type) {
        case "mood": {
          const category = this.moodCategories.find(
            (cat) => cat.title.toLowerCase() === intent.query
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
        this.isLoading = false;
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

  private resetViewData(): void {
    this.tracks = [];
    this.albums = [];
    this.artists = [];
    this.playlists = [];
    this.activeArtist = null;
    this.activeAlbum = null;
    this.activePlaylist = null;
    this.activeCharts = null;
  }
}

export const explorer = new MusicExplorer();
