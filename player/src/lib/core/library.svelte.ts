import { sinatraApi, API_BASE_URL } from "$lib/api/main";
import type { LibraryTrack } from "$lib/types/track";
import type {
  MetadataFields,
  SortableField,
  SortDirection,
} from "$lib/types/metadata";
import type { FilterIntent } from "$lib/utils/commandParser";
import { player } from "$lib/core/player.svelte";

export interface TagRecommendation {
  tag: string;
  confidence: number;
}

export class MusicLibrary {
  private eventSource: EventSource | null = null;
  lastSyncTime: string = new Date().toISOString();
  tracks = $state<LibraryTrack[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);

  activeFilter = $state<FilterIntent | null>(null);
  sortColumn = $state<SortableField | null>(null);
  sortDirection = $state<SortDirection>(null);

  highlightedTrackId = $state<string | null>(null);

  lyricMatches = $state(new Map<string, string[]>());
  private lyricQueryResults = $state(new Map<string, Map<string, string[]>>());
  isSearchingLyrics = $state(false);
  isLoadingLyrics = $state(false);

  /**
   * All active positive emotion filter keys (normalized to lowercase) in the AST.
   */
  activeEmotionQueries = $derived.by(() => {
    const emotionFilters = this.findAllFiltersByType(
      this.activeFilter,
      "emotion_filter",
      false // exclude negated `not :emotion ...` from positive badge/sort
    );
    return Array.from(
      new Set(
        emotionFilters.map((f) => f.query.trim().toLowerCase()).filter(Boolean)
      )
    );
  });

  /**
   * Primary emotion query for backwards compatibility.
   */
  activeEmotionQuery = $derived(this.activeEmotionQueries[0] ?? null);

  private lyricSearchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.fetchTracks();
      this.initRealtimeSync();
    }
  }

  initRealtimeSync() {
    this.eventSource = new EventSource(`${API_BASE_URL}/api/events/stream`);
    this.eventSource.addEventListener("library:updated", async () => {
      await this.fetchDelta();
    });
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

  async fetchDelta() {
    try {
      const delta = await sinatraApi.getLibraryTracks(this.lastSyncTime);
      this.lastSyncTime = new Date().toISOString();

      if (!delta || delta.length === 0) return;

      // Immutably merge into tracks map/array
      const trackMap = new Map(this.tracks.map((t) => [t.id, t]));
      for (const track of delta) {
        trackMap.set(track.id, track);
      }
      this.tracks = Array.from(trackMap.values());
    } catch (err) {
      console.error("Failed to fetch library delta updates:", err);
    }
  }

  /**
   * Lazy-loads lyrics for a track only if they haven't been fetched yet.
   * Populates `track.lyrics` directly in `this.tracks`.
   */
  async ensureTrackLyrics(trackId: string): Promise<void> {
    const track = this.tracks.find((t) => t.id === trackId);
    if (!track || track.lyrics !== undefined) return;

    this.isLoadingLyrics = true;
    try {
      const fetched = await sinatraApi.getTrackLyrics(trackId);
      const lyrics = fetched ?? "";

      const idx = this.tracks.findIndex((t) => t.id === trackId);
      if (idx !== -1) {
        this.tracks[idx] = {
          ...this.tracks[idx],
          lyrics,
        };
      }
      player.syncTrackMetadata(trackId, { lyrics });
    } catch (err) {
      console.error(`Failed to fetch lyrics for track ${trackId}:`, err);
    } finally {
      this.isLoadingLyrics = false;
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

  getCombinedSearchableString(track: LibraryTrack): string {
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

  async performLyricSearches(queries: string[]) {
    const cleanQueries = Array.from(
      new Set(queries.map((q) => q.trim()).filter(Boolean))
    );

    if (cleanQueries.length === 0) {
      this.lyricQueryResults = new Map();
      this.lyricMatches = new Map();
      return;
    }

    // Keep cached results for queries that haven't changed
    const nextResults = new Map<string, Map<string, string[]>>();
    const queriesToFetch: string[] = [];

    for (const q of cleanQueries) {
      const existing = this.lyricQueryResults.get(q);
      if (existing) {
        nextResults.set(q, existing);
      } else {
        queriesToFetch.push(q);
      }
    }

    if (queriesToFetch.length > 0) {
      this.isSearchingLyrics = true;
      try {
        const fetched = await Promise.all(
          queriesToFetch.map(async (q) => {
            const results = await sinatraApi.searchLyrics(q);
            const matchMap = new Map<string, string[]>();
            for (const item of results) {
              matchMap.set(item.id, item.matches);
            }
            return [q, matchMap] as const;
          })
        );

        for (const [q, matchMap] of fetched) {
          nextResults.set(q, matchMap);
        }
      } catch (err) {
        console.error("Failed to search lyrics:", err);
      } finally {
        this.isSearchingLyrics = false;
      }
    }

    this.lyricQueryResults = nextResults;

    // Merge positive lyric matches into `this.lyricMatches` for UI snippet display
    const mergedMatches = new Map<string, string[]>();
    for (const matchMap of nextResults.values()) {
      for (const [trackId, lines] of matchMap.entries()) {
        const existingLines = mergedMatches.get(trackId);
        if (existingLines) {
          const combined = Array.from(new Set([...existingLines, ...lines]));
          mergedMatches.set(trackId, combined);
        } else {
          mergedMatches.set(trackId, lines);
        }
      }
    }
    this.lyricMatches = mergedMatches;
  }

  /**
   * Returns the highest-scoring matched emotion name and raw score (0.0 - 1.0)
   * for a track among any active emotion filters.
   */
  getTrackEmotionMatch(
    track: LibraryTrack
  ): { emotion: string; level: number } | null {
    if (this.activeEmotionQueries.length === 0) return null;

    let bestMatch: { emotion: string; level: number } | null = null;
    for (const emotion of this.activeEmotionQueries) {
      const level = track.acoustic_emotions?.[emotion];
      if (level !== undefined && level > 0.1) {
        if (!bestMatch || level > bestMatch.level) {
          bestMatch = { emotion, level };
        }
      }
    }
    return bestMatch;
  }

  /**
   * Collects all filter nodes of a given type across the boolean AST.
   * When `includeNegated` is false, skips branches inside a `not` operator.
   */
  private findAllFiltersByType<T extends FilterIntent["type"]>(
    filter: FilterIntent | null,
    type: T,
    includeNegated: boolean = true
  ): Extract<FilterIntent, { type: T }>[] {
    if (!filter) return [];
    if (filter.type === type) {
      return [filter as Extract<FilterIntent, { type: T }>];
    }

    switch (filter.type) {
      case "queued_filter":
        return this.findAllFiltersByType(filter.filter, type, includeNegated);
      case "not":
        return includeNegated
          ? this.findAllFiltersByType(filter.operand, type, includeNegated)
          : [];
      case "and":
      case "or":
        return [
          ...this.findAllFiltersByType(filter.left, type, includeNegated),
          ...this.findAllFiltersByType(filter.right, type, includeNegated),
        ];
      default:
        return [];
    }
  }

  /**
   * Returns the first filter node matching `type` in the AST, or null.
   */
  private findFilterByType<T extends FilterIntent["type"]>(
    filter: FilterIntent | null,
    type: T
  ): Extract<FilterIntent, { type: T }> | null {
    return this.findAllFiltersByType(filter, type)[0] ?? null;
  }

  /**
   * Helper that evaluates whether a track matches a FilterIntent recursively.
   */
  /**
   * Helper that evaluates whether a track matches a FilterIntent recursively.
   */
  private matchesFilter(
    track: LibraryTrack,
    filter: FilterIntent,
    queuedIds: Set<string>
  ): boolean {
    switch (filter.type) {
      case "and":
        return (
          this.matchesFilter(track, filter.left, queuedIds) &&
          this.matchesFilter(track, filter.right, queuedIds)
        );

      case "or":
        return (
          this.matchesFilter(track, filter.left, queuedIds) ||
          this.matchesFilter(track, filter.right, queuedIds)
        );

      case "not":
        return !this.matchesFilter(track, filter.operand, queuedIds);

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

      case "emotion_filter": {
        const q = filter.query.trim().toLowerCase();
        if (!q) return true;
        const emotionLevel = track.acoustic_emotions?.[q];
        return !!emotionLevel && emotionLevel > 0.1;
      }

      case "lyrics_filter": {
        const q = filter.query.trim();
        if (!q) return true;
        const queryMap = this.lyricQueryResults.get(q);
        return queryMap ? queryMap.has(track.id) : false;
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

  getFilteredTracks(filter: FilterIntent): LibraryTrack[] {
    const queuedIds = new Set(player.queue.map((t) => t.id));
    return this.tracks.filter((track) =>
      this.matchesFilter(track, filter, queuedIds)
    );
  }

  filterTracks(): LibraryTrack[] {
    if (!this.activeFilter) {
      return [...this.tracks];
    }
    return this.getFilteredTracks(this.activeFilter);
  }

  sortTracks(tracks: LibraryTrack[]) {
    if (this.sortColumn && this.sortDirection) {
      const sortColumn = this.sortColumn;
      const dirMultiplier = this.sortDirection === "asc" ? 1 : -1;
      tracks.sort((a, b) => {
        if (sortColumn === "duration") {
          return ((a.duration ?? 0) - (b.duration ?? 0)) * dirMultiplier;
        }

        if (sortColumn === "tags") {
          const aTags = a.tags ?? [];
          const bTags = b.tags ?? [];
          if (aTags.length !== bTags.length) {
            return (aTags.length - bTags.length) * dirMultiplier;
          }
          return (aTags[0] ?? "").localeCompare(bTags[0] ?? "") * dirMultiplier;
        }

        const aVal = String(a[sortColumn] ?? "");
        const bVal = String(b[sortColumn] ?? "");
        return aVal.localeCompare(bVal) * dirMultiplier;
      });
    } else if (this.activeEmotionQueries.length > 0) {
      const emotions = this.activeEmotionQueries;
      const getMaxScore = (t: LibraryTrack) =>
        Math.max(0, ...emotions.map((e) => t.acoustic_emotions?.[e] ?? 0));

      tracks.sort((a, b) => getMaxScore(b) - getMaxScore(a));
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

    player.syncTrackMetadata(trackId, fields);

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

    const lyricsFilters = this.findAllFiltersByType(filter, "lyrics_filter");
    if (lyricsFilters.length > 0) {
      if (this.lyricSearchDebounceTimer) {
        clearTimeout(this.lyricSearchDebounceTimer);
      }
      const queries = lyricsFilters.map((f) => f.query);
      this.lyricSearchDebounceTimer = setTimeout(() => {
        this.performLyricSearches(queries);
      }, 300);
    } else if (this.lyricQueryResults.size > 0 || this.lyricMatches.size > 0) {
      if (this.lyricSearchDebounceTimer) {
        clearTimeout(this.lyricSearchDebounceTimer);
        this.lyricSearchDebounceTimer = null;
      }
      this.lyricQueryResults = new Map();
      this.lyricMatches = new Map();
    }

    this.activeFilter = filter;
  }

  clearFilter() {
    if (this.lyricSearchDebounceTimer) {
      clearTimeout(this.lyricSearchDebounceTimer);
      this.lyricSearchDebounceTimer = null;
    }
    this.lyricQueryResults = new Map();
    this.lyricMatches = new Map();
    this.activeFilter = null;
  }

  enqueueAllFiltered() {
    for (const track of this.displayedTracks) {
      player.enqueue(track);
    }
  }

  /**
   * Returns N randomly sampled tracks matching an optional filter.
   * Uses a partial Fisher-Yates shuffle to sample without full array duplication.
   */
  getRandomTracks(count = 1, filter?: FilterIntent): LibraryTrack[] {
    const pool = filter ? this.getFilteredTracks(filter) : [...this.tracks];
    if (pool.length === 0) return [];

    const sampleCount = Math.min(count, pool.length);
    const result = [];
    const takenIndices = new Set<number>();

    while (result.length < sampleCount) {
      const idx = Math.floor(Math.random() * pool.length);
      if (!takenIndices.has(idx)) {
        takenIndices.add(idx);
        result.push(pool[idx]);
      }
    }

    return result;
  }

  setHighlightedTrack(id: string | null) {
    this.highlightedTrackId = id;
  }
}

export const library = new MusicLibrary();
