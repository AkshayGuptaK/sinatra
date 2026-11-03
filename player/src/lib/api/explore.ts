import type { SearchType } from "$lib/utils/commandParser";
import { API_BASE_URL } from "./main";

export interface RemoteTrack {
  video_id: string;
  title: string;
  artist: string;
  duration: number;
  artist_id?: string | null;
  album?: string | null;
  album_id?: string | null;
  thumbnail?: string | null;
  is_explicit?: boolean;
  lyrics_browse_id?: string | null;
  source: string;
  result_type?: "song" | "video";
}

export interface RemoteAlbum {
  browse_id: string;
  title: string;
  artist: string;
  artist_id?: string | null;
  year?: string | null;
  album_type?: string | null;
  thumbnail?: string | null;
  source: string;
  result_type?: "album";
}

export interface RemoteArtist {
  browse_id: string;
  name: string;
  subscribers?: string | null;
  thumbnail?: string | null;
  source: string;
  result_type?: "artist";
}

export interface RemotePlaylist {
  playlist_id: string;
  title: string;
  author?: string | null;
  track_count?: string | null;
  description?: string | null;
  thumbnail?: string | null;
  source: string;
  result_type?: "playlist";
}

export type ExploreSearchResult =
  | RemoteTrack
  | RemoteAlbum
  | RemoteArtist
  | RemotePlaylist;

export interface ArtistReleaseSection {
  items: RemoteAlbum[];
  browse_id?: string | null;
  params?: string | null;
}

export interface RemoteArtistDetails {
  browse_id: string;
  name: string;
  description?: string | null;
  views?: string | null;
  subscribers?: string | null;
  thumbnail?: string | null;
  songs_playlist_id?: string | null;
  songs: RemoteTrack[];
  albums: ArtistReleaseSection;
  singles: ArtistReleaseSection;
  related_artists: RemoteArtist[];
}

export interface RemoteAlbumDetails {
  browse_id: string;
  audio_playlist_id?: string | null;
  title: string;
  artist: string;
  artist_id?: string | null;
  year?: string | null;
  album_type?: string | null;
  description?: string | null;
  track_count?: number | null;
  duration_seconds?: number | null;
  thumbnail?: string | null;
  tracks: RemoteTrack[];
}

export interface RemotePlaylistDetails {
  playlist_id: string;
  title: string;
  author?: string | null;
  description?: string | null;
  track_count?: string | null;
  year?: string | null;
  duration_seconds?: number | null;
  thumbnail?: string | null;
  tracks: RemoteTrack[];
}

export interface MoodCategoryItem {
  title: string;
  params: string;
}

export interface RemoteCharts {
  country: string;
  countries: Array<{ text: string; value: string }>;
  songs: RemoteTrack[];
  videos: RemoteTrack[];
  trending: RemoteTrack[];
  artists: RemoteArtist[];
  genres: RemotePlaylist[];
}

export interface SearchExploreParams {
  filter: SearchType;
  query: string;
  limit?: number;
  ignoreSpelling?: boolean;
}

export interface DownloadTrackResponse {
  status: "success";
  source: string;
  track_id: string;
  filename: string;
  filepath: string;
}

// =============================================================================
// API Client Methods
// =============================================================================
export const explorerApi = {
  /**
   * Returns registered music exploration sources (e.g. ['ytm', 'youtube']).
   */
  async getExploreSources(): Promise<string[]> {
    const res = await fetch(`${API_BASE_URL}/api/explore/sources`);
    if (!res.ok) {
      throw new Error(`Failed to fetch explore sources: ${res.statusText}`);
    }
    const data = await res.json();
    return data.sources ?? [];
  },

  /**
   * Searches the remote catalog across songs, albums, artists, or playlists.
   */
  async searchExplore(
    source: string,
    params: SearchExploreParams
  ): Promise<ExploreSearchResult[]> {
    const queryParams = new URLSearchParams({
      q: params.query.trim(),
      limit: String(params.limit ?? 20),
      ignore_spelling: String(params.ignoreSpelling ?? false),
    });

    if (params.filter) {
      queryParams.set("filter", params.filter);
    }

    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/search?${queryParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to search ${source} catalog: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches real-time search prediction suggestions for autocomplete.
   */
  async getExploreSuggestions(
    source: string,
    query: string,
    detailed: boolean = false
  ): Promise<string[] | any[]> {
    const queryParams = new URLSearchParams({
      q: query.trim(),
      detailed: String(detailed),
    });

    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/suggestions?${queryParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${source} suggestions: ${res.statusText}`
      );
    }
    return res.json();
  },

  /**
   * Fetches artist details, top songs, discography shelves, and related artists.
   */
  async getExploreArtist(
    source: string,
    artistId: string
  ): Promise<RemoteArtistDetails> {
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/artists/${encodeURIComponent(artistId)}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch artist details: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches full albums/singles discography list for an artist when "See All" is requested.
   */
  async getExploreArtistAlbums(
    source: string,
    artistId: string,
    continuationParams: string,
    limit: number = 100
  ): Promise<RemoteAlbum[]> {
    const queryParams = new URLSearchParams({
      params: continuationParams,
      limit: String(limit),
    });

    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/artists/${encodeURIComponent(
        artistId
      )}/albums?${queryParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch artist discography: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Resolves album metadata and ordered tracklist.
   */
  async getExploreAlbum(
    source: string,
    albumId: string
  ): Promise<RemoteAlbumDetails> {
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/albums/${encodeURIComponent(albumId)}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch album details: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches rich relational metadata for a single remote song.
   */
  async getExploreSong(source: string, trackId: string): Promise<RemoteTrack> {
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/songs/${encodeURIComponent(trackId)}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch song metadata: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches mood, genre, and activity categories.
   */
  async getExploreMoods(source: string): Promise<MoodCategoryItem[]> {
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(source)}/moods`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch mood categories: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches curated playlists for a selected mood/genre category parameter token.
   */
  async getExploreMoodPlaylists(
    source: string,
    paramsToken: string
  ): Promise<RemotePlaylist[]> {
    const queryParams = new URLSearchParams({ params: paramsToken });
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/moods/playlists?${queryParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch mood playlists: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Resolves a remote playlist into its metadata and ordered track items.
   */
  async getExplorePlaylist(
    source: string,
    playlistId: string,
    limit: number = 100
  ): Promise<RemotePlaylistDetails> {
    const queryParams = new URLSearchParams({ limit: String(limit) });
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/playlists/${encodeURIComponent(playlistId)}?${queryParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch playlist details: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches global or country-specific trending songs, videos, and charts.
   */
  async getExploreCharts(
    source: string,
    country: string = "ZZ"
  ): Promise<RemoteCharts> {
    const queryParams = new URLSearchParams({ country });
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/charts?${queryParams.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch charts: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Downloads a remote track to the server's music library directory,
   * triggering the automatic sync and embedding pipeline.
   */
  async downloadTrack(
    source: string,
    trackId: string
  ): Promise<DownloadTrackResponse> {
    const res = await fetch(
      `${API_BASE_URL}/api/explore/${encodeURIComponent(
        source
      )}/download/${encodeURIComponent(trackId)}`,
      {
        method: "POST",
      }
    );

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(
        errorData.detail || `Failed to download track: ${res.statusText}`
      );
    }

    return res.json();
  },
};
