import { sinatraApi } from "$lib/api/sinatra";
import type { Track } from "$lib/types/track";

export type ColumnFilterKey = "title" | "artist" | "album" | "mood";

export class MusicLibrary {
  tracks = $state<Track[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);

  searchQuery = $state("");
  columnFilterKey = $state<ColumnFilterKey | "all">("all");

  filteredTracks = $derived.by(() => {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.tracks;

    return this.tracks.filter((track) => {
      if (this.columnFilterKey !== "all") {
        const val = track[this.columnFilterKey];
        return val ? String(val).toLowerCase().includes(query) : false;
      }

      return (
        (track.title && track.title.toLowerCase().includes(query)) ||
        (track.artist && track.artist.toLowerCase().includes(query)) ||
        (track.album && track.album.toLowerCase().includes(query)) ||
        (track.mood && track.mood.toLowerCase().includes(query))
      );
    });
  });

  constructor() {
    if (typeof window !== "undefined") {
      this.fetchTracks();
    }
  }

  async fetchTracks() {
    this.isLoading = true;
    this.error = null;
    try {
      const data = await sinatraApi.getLibraryTracks();
      if (data) this.tracks = data;
    } catch (e: any) {
      console.error("Failed to load library tracks:", e);
      this.error = e?.message || "Failed to fetch tracks";
    } finally {
      this.isLoading = false;
    }
  }

  setFilter(query: string, key: ColumnFilterKey | "all" = "all") {
    this.searchQuery = query;
    this.columnFilterKey = key;
  }

  clearFilter() {
    this.searchQuery = "";
    this.columnFilterKey = "all";
  }
}

export const library = new MusicLibrary();
