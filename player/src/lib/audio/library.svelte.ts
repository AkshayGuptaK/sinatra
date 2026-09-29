import { sinatraApi } from "$lib/api/sinatra";
import type { Track } from "$lib/types/track";
import type {
  MetadataFields,
  SortableField,
  SortDirection,
} from "$lib/types/metadata";
import { player } from "$lib/audio/player.svelte";
import type { FilterIntent } from "$lib/utils/commandParser";

export class MusicLibrary {
  tracks = $state<Track[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);

  activeFilter = $state<FilterIntent | null>(null);
  sortColumn = $state<SortableField | null>(null);
  sortDirection = $state<SortDirection>(null);

  highlightedTrackId = $state<string | null>(null);

  toggleSort(column: SortableField) {
    if (this.sortColumn !== column) {
      this.sortColumn = column;
      this.sortDirection = "asc";
      return;
    }

    if (this.sortDirection === "asc") {
      this.sortDirection = "desc";
    } else if (this.sortDirection === "desc") {
      this.sortDirection = null;
      this.sortColumn = null;
    } else {
      this.sortDirection = "asc";
    }
  }

  getCombinedSearchableString(track: Track): string {
    return [
      track.title,
      track.artist,
      track.album,
      track.mood,
      track.tags?.join(" "),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
  }

  /**
   * Helper that evaluates whether a track matches a FilterIntent recursively.
   */
  private matchesFilter(
    track: Track,
    filter: FilterIntent,
    queuedIds: Set<string>
  ): boolean {
    switch (filter.type) {
      case "queued_filter": {
        if (!queuedIds.has(track.id)) return false;
        return this.matchesFilter(track, filter.filter, queuedIds);
      }

      case "column_filter": {
        const q = filter.query.trim().toLowerCase();
        if (!q) return true;

        if (filter.column === "tags") {
          return track.tags?.some((t) => t.includes(q)) ?? false;
        }

        const val = track[filter.column];
        return val ? String(val).toLowerCase().includes(q) : false;
      }

      case "duration_filter": {
        const duration = track.duration ?? 0;
        switch (filter.operator) {
          case ">":
            return duration > filter.seconds;
          case "<":
            return duration < filter.seconds;
          case ">=":
            return duration >= filter.seconds;
          case "<=":
            return duration <= filter.seconds;
        }
      }

      case "text_search": {
        const q = filter.query.trim();
        if (!q) return true;

        const queryTokens = q.toLowerCase().split(/\s+/).filter(Boolean);
        const combined = this.getCombinedSearchableString(track);
        return queryTokens.every((token) => combined.includes(token));
      }
    }
  }

  filterQueuedTracks(query: string) {
    const queuedIds = new Set(player.queue.map((t) => t.id));
    const queuedTracks = this.tracks.filter((track) => queuedIds.has(track.id));
    if (!query) return queuedTracks;

    const queryTokens = query.toLowerCase().split(/\s+/).filter(Boolean);

    return queuedTracks.filter((track) => {
      const combined = this.getCombinedSearchableString(track);
      return queryTokens.every((token) => combined.includes(token));
    });
  }

  filterTracks(): Track[] {
    if (!this.activeFilter) {
      return [...this.tracks];
    }

    const queuedIds = new Set(player.queue.map((t) => t.id));
    return this.tracks.filter((track) =>
      this.matchesFilter(track, this.activeFilter!, queuedIds)
    );
  }

  sortTracks(tracks: Track[]) {
    if (this.sortColumn && this.sortDirection) {
      const sortColumn = this.sortColumn;
      const dirMultiplier = this.sortDirection === "asc" ? 1 : -1;
      tracks.sort((a, b) => {
        if (sortColumn === "duration") {
          return ((a.duration ?? 0) - (b.duration ?? 0)) * dirMultiplier;
        }

        if (sortColumn === "tags") {
          if (a.tags.length !== b.tags.length) {
            return (a.tags.length - b.tags.length) * dirMultiplier;
          }
          const aFirst = a.tags[0] ?? "";
          const bFirst = b.tags[0] ?? "";
          return aFirst.localeCompare(bFirst) * dirMultiplier;
        }

        const aVal = String(a[sortColumn] ?? "");
        const bVal = String(b[sortColumn] ?? "");
        return aVal.localeCompare(bVal) * dirMultiplier;
      });
    }
    return tracks;
  }

  displayedTracks = $derived.by(() => {
    const filteredTracks = this.filterTracks();
    return this.sortTracks(filteredTracks);
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

  setFilter(filter: FilterIntent) {
    if (filter.type === "text_search" && !filter.query) {
      this.clearFilter();
      return;
    }
    this.activeFilter = filter;
  }

  clearFilter() {
    this.activeFilter = null;
  }

  setHighlightedTrack(id: string | null) {
    const a = this.highlightedTrackId;
    this.highlightedTrackId = id;
  }
}

export const library = new MusicLibrary();
