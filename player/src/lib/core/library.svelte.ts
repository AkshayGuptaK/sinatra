import { sinatraApi } from "$lib/api/sinatra";
import type { Track } from "$lib/types/track";
import type {
  MetadataFields,
  SortableField,
  SortDirection,
} from "$lib/types/metadata";
import { player } from "$lib/core/player.svelte";
import type { FilterIntent } from "$lib/utils/commandParser";

export interface TagRecommendation {
  tag: string;
  confidence: number;
}

export class MusicLibrary {
  tracks = $state<Track[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);

  activeFilter = $state<FilterIntent | null>(null);
  sortColumn = $state<SortableField | null>(null);
  sortDirection = $state<SortDirection>(null);

  highlightedTrackId = $state<string | null>(null);

  lyricMatches = $state<Map<string, string[]>>(new Map());
  isSearchingLyrics = $state(false);
  private lyricSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private lastLyricQuery = "";

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

  async performLyricSearch(query: string) {
    const cleanQuery = query.trim();
    if (!cleanQuery) {
      this.lyricMatches = new Map();
      this.lastLyricQuery = "";
      return;
    }

    if (cleanQuery === this.lastLyricQuery) return;
    this.lastLyricQuery = cleanQuery;

    this.isSearchingLyrics = true;
    try {
      const results = await sinatraApi.searchLyrics(cleanQuery);
      const matchMap = new Map<string, string[]>();
      for (const item of results) {
        matchMap.set(item.id, item.matches);
      }
      this.lyricMatches = matchMap;
    } catch (err) {
      console.error("Failed to search lyrics:", err);
      this.lyricMatches = new Map();
    } finally {
      this.isSearchingLyrics = false;
    }
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

      case "lyrics_filter": {
        const q = filter.query.trim();
        if (!q) return true;
        return this.lyricMatches.has(track.id);
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

  getFilteredTracks(filter: FilterIntent): Track[] {
    const queuedIds = new Set(player.queue.map((t) => t.id));
    return this.tracks.filter((track) =>
      this.matchesFilter(track, filter, queuedIds)
    );
  }

  filterTracks(): Track[] {
    if (!this.activeFilter) {
      return [...this.tracks];
    }
    return this.getFilteredTracks(this.activeFilter);
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

  async getNewTagSuggestions(trackId: string): Promise<TagRecommendation[]> {
    try {
      const res = await sinatraApi.getTagSuggestions(trackId, 0.5);
      const existing = new Set(
        (res.existing_tags ?? []).map((t) => t.trim().toLowerCase())
      );

      // Filter out tags already assigned to the track
      const newSuggestions: TagRecommendation[] = Object.entries(
        res.suggestions || {}
      )
        .filter(([tag]) => !existing.has(tag.trim().toLowerCase()))
        .map(([tag, confidence]) => ({
          tag: tag.trim().toLowerCase(),
          confidence,
        }))
        .sort((a, b) => b.confidence - a.confidence);

      return newSuggestions;
    } catch (err) {
      console.error(
        `Failed to get tag recommendations for track ${trackId}:`,
        err
      );
      return [];
    }
  }

  setFilter(filter: FilterIntent) {
    if (filter.type === "text_search" && !filter.query) {
      this.clearFilter();
      return;
    }
    if (filter.type === "lyrics_filter") {
      if (this.lyricSearchDebounceTimer) {
        clearTimeout(this.lyricSearchDebounceTimer);
      }
      this.lyricSearchDebounceTimer = setTimeout(() => {
        this.performLyricSearch(filter.query);
      }, 300);
    } else if (this.activeFilter?.type === "lyrics_filter") {
      this.lyricMatches = new Map();
      this.lastLyricQuery = "";
    }
    this.activeFilter = filter;
  }

  clearFilter() {
    if (this.lyricSearchDebounceTimer) {
      clearTimeout(this.lyricSearchDebounceTimer);
      this.lyricSearchDebounceTimer = null;
    }
    this.lyricMatches = new Map();
    this.lastLyricQuery = "";
    this.activeFilter = null;
  }

  setHighlightedTrack(id: string | null) {
    const a = this.highlightedTrackId;
    this.highlightedTrackId = id;
  }
}

export const library = new MusicLibrary();
