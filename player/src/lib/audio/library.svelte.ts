import { sinatraApi } from "$lib/api/sinatra";
import type { Track } from "$lib/types/track";
import type { FilterableField, MetadataFields } from "$lib/types/metadata";

export class MusicLibrary {
  tracks = $state<Track[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);

  searchQuery = $state("");
  columnFilterKey = $state<FilterableField | "all">("all");

  filteredTracks = $derived.by(() => {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) return this.tracks;

    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    return this.tracks.filter((track) => {
      if (this.columnFilterKey === "tags") {
        const q = query.toLowerCase();
        return track.tags?.some((t) => t.includes(q));
      }

      if (this.columnFilterKey !== "all") {
        const val = track[this.columnFilterKey];
        return val ? String(val).toLowerCase().includes(query) : false;
      }

      const combined = [
        track.title,
        track.artist,
        track.album,
        track.mood,
        track.tags?.join(" "),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return queryTokens.every((token) => combined.includes(token));
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

  private cleanAndSortTags(tags: string[]) {
    return Array.from(
      new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }

  async updateTrackMetadata(
    trackId: string,
    fields: MetadataFields
  ): Promise<void> {
    const trackIndex = this.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) return;

    const originalTrack = { ...this.tracks[trackIndex] };

    if (fields.tags !== undefined) {
      fields.tags = this.cleanAndSortTags(fields.tags);
    }

    this.tracks[trackIndex] = {
      ...originalTrack,
      ...fields,
    };

    try {
      await sinatraApi.updateTrackMetadata(trackId, fields);
    } catch (err) {
      console.error(`Failed to update metadata for track ${trackId}:`, err);
      this.tracks[trackIndex] = originalTrack;
      throw err;
    }
  }

  async addTagToTracks(trackIds: string[], tag: string): Promise<void> {
    const cleanTag = tag.trim().toLowerCase();
    if (!cleanTag || trackIds.length === 0) return;

    const targetIds = new Set(trackIds);

    const tracksToUpdate = this.tracks.filter(
      (t) => targetIds.has(t.id) && !(t.tags ?? []).includes(cleanTag)
    );

    if (tracksToUpdate.length === 0) return;

    await Promise.allSettled(
      tracksToUpdate.map((track) =>
        this.updateTrackMetadata(track.id, {
          tags: [...(track.tags ?? []), cleanTag],
        })
      )
    );
  }

  setFilter(query: string, key: FilterableField | "all" = "all") {
    this.searchQuery = query;
    this.columnFilterKey = key;
  }

  clearFilter() {
    this.searchQuery = "";
    this.columnFilterKey = "all";
  }
}

export const library = new MusicLibrary();
