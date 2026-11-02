// src/lib/core/explorer.svelte.ts
import {
  explorerApi,
  type MoodCategoriesResponse,
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

  moodCategories = $state<MoodCategoriesResponse>({});
  isLoadingMoods = $state(false);

  activeIntent = $state<SearchIntent>({ type: "charts", country: "ZZ" });
  intentHistory = $state<SearchIntent[]>([]);

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

  canGoBack = $derived(this.intentHistory.length > 0);
  totalDuration = $derived(
    this.tracks.reduce((acc, t) => acc + (t.duration ?? 0), 0)
  );

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
        this.executeIntent(this.activeIntent, false),
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
    this.intentHistory = [];
    await Promise.all([
      this.loadMoodCategories(),
      this.executeIntent(this.activeIntent, false),
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
      this.moodCategories = {};
    } finally {
      this.isLoadingMoods = false;
    }
  }

  /**
   * Sets and executes a new SearchIntent.
   * By default, pushes the previous intent onto the history stack for Back navigation.
   */
  async setSearchIntent(
    intent: SearchIntent,
    pushHistory: boolean = true
  ): Promise<void> {
    // Ignore empty catalog searches by returning to default charts view
    if (intent.type === "catalog_search" && !intent.query.trim()) {
      return this.setSearchIntent({ type: "charts", country: "ZZ" }, false);
    }

    await this.executeIntent(intent, pushHistory);
  }

  /**
   * Navigates back to the previous SearchIntent in the drill-down history.
   */
  async goBack(): Promise<void> {
    if (this.intentHistory.length === 0) return;
    const previousIntent = this.intentHistory[this.intentHistory.length - 1];
    this.intentHistory = this.intentHistory.slice(0, -1);
    await this.executeIntent(previousIntent, false);
  }

  /**
   * Core dispatcher that resolves any SearchIntent against explorerApi.
   */
  private async executeIntent(
    intent: SearchIntent,
    pushHistory: boolean
  ): Promise<void> {
    const currentRequestId = ++this.requestCounter;

    if (pushHistory && this.isInitialized) {
      this.intentHistory = [...this.intentHistory, this.activeIntent];
    }

    this.activeIntent = intent;
    this.isLoading = true;
    this.error = null;

    try {
      switch (intent.type) {
        case "catalog_search": {
          const filter = intent.filter ?? "songs";
          const results = await explorerApi.searchExplore(this.activeSource, {
            query: intent.query,
            filter,
            limit: intent.limit ?? 30,
          });

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
          break;
        }

        case "artist_detail": {
          const artist = await explorerApi.getExploreArtist(
            this.activeSource,
            intent.artistId
          );

          if (currentRequestId !== this.requestCounter) return;
          this.resetViewData();

          this.activeArtist = artist;
          this.tracks = artist.songs ?? [];
          this.albums = [
            ...(artist.albums?.items ?? []),
            ...(artist.singles?.items ?? []),
          ];
          this.artists = artist.related_artists ?? [];
          break;
        }

        case "artist_albums": {
          const albums = await explorerApi.getExploreArtistAlbums(
            this.activeSource,
            intent.artistId,
            intent.params
          );

          if (currentRequestId !== this.requestCounter) return;
          this.resetViewData();
          this.albums = albums;
          break;
        }

        case "album_detail": {
          const album = await explorerApi.getExploreAlbum(
            this.activeSource,
            intent.albumId
          );

          if (currentRequestId !== this.requestCounter) return;
          this.resetViewData();

          this.activeAlbum = album;
          this.tracks = album.tracks ?? [];
          break;
        }

        case "mood_playlists": {
          const playlists = await explorerApi.getExploreMoodPlaylists(
            this.activeSource,
            intent.params
          );

          if (currentRequestId !== this.requestCounter) return;
          this.resetViewData();
          this.playlists = playlists;
          break;
        }

        case "playlist_detail": {
          const playlist = await explorerApi.getExplorePlaylist(
            this.activeSource,
            intent.playlistId
          );

          if (currentRequestId !== this.requestCounter) return;
          this.resetViewData();

          this.activePlaylist = playlist;
          this.tracks = playlist.tracks ?? [];
          break;
        }

        case "charts": {
          const charts = await explorerApi.getExploreCharts(
            this.activeSource,
            intent.country ?? "ZZ"
          );

          if (currentRequestId !== this.requestCounter) return;
          this.resetViewData();

          this.activeCharts = charts;
          // Combine top songs and trending (deduplicated by video_id) for the main track table
          const seen = new Set<string>();
          const combinedTracks: RemoteTrack[] = [];
          for (const t of [
            ...(charts.songs ?? []),
            ...(charts.trending ?? []),
          ]) {
            if (t.video_id && !seen.has(t.video_id)) {
              seen.add(t.video_id);
              combinedTracks.push(t);
            }
          }
          this.tracks = combinedTracks;
          this.artists = charts.artists ?? [];
          this.playlists = charts.genres ?? [];
          break;
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
