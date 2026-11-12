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
   * Switches the active exploration source
   * and refreshes mood categories and the current intent.
   */
  async setSource(source: string): Promise<void> {
    if (source === this.activeSource || !this.sources.includes(source)) return;
    this.activeSource = source;
    await Promise.all([
      this.loadInitialData(),
      this.executeIntent(this.activeIntent),
    ]);
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
      this.topCharts = await explorerApi.getExploreCharts(this.activeSource);
    } catch (err) {
      console.error("Failed to load explore mood categories:", err);
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Core dispatcher that resolves any SearchIntent against explorerApi.
   */
  async executeIntent(intent: SearchIntent): Promise<void> {
    const currentRequestId = ++this.requestCounter;

    this.isLoadingSearch = true;
    this.error = null;

    try {
      let results = [];
      switch (intent.type) {
        case "mood": {
          const category = Object.values(this.moodCategories)
            .flatMap((arr) => arr)
            .find((cat) => cat.title.toLowerCase() === intent.query);
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

  exploreMood = async (category: MoodCategoryItem) => {
    try {
      this.resetViewData();
      this.activeCategory = category;
      this.playlists = await explorerApi.getExploreMoodPlaylists(
        this.activeSource,
        category.params
      );
    } catch (err) {
      console.error("Mood playlists couldn't be fetched", err);
    }
  };

  exploreArtist = async (artistId: string) => {
    try {
      this.resetViewData();
      this.activeArtist = await explorerApi.getExploreArtist(
        this.activeSource,
        artistId
      );
    } catch (err) {
      console.error("Artist details couldn't be fetched", err);
    }
  };

  exploreAlbum = async (albumId: string) => {
    try {
      this.resetViewData();
      this.activeAlbum = await explorerApi.getExploreAlbum(
        this.activeSource,
        albumId
      );
    } catch (err) {
      console.error("Album details couldn't be fetched", err);
    }
  };

  explorePlaylist = async (playlistId: string) => {
    try {
      this.resetViewData();
      this.activePlaylist = await explorerApi.getExplorePlaylist(
        this.activeSource,
        playlistId
      );
    } catch (err) {
      console.error("Playlist details couldn't be fetched", err);
    }
  };

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
