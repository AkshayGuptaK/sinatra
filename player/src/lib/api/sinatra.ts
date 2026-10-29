import type { Track, TrackSegment } from "$lib/types/track";
import type { MetadataFields } from "$lib/types/metadata";
import type { FilterIntent } from "$lib/utils/commandParser";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface SuggestTagsResponse {
  track_id?: string;
  existing_tags: string[];
  suggestions: Record<string, number>;
}

export interface TrackLyricMatch {
  id: string;
  matches: string[];
}

export type SimilarityMode = "acoustics" | "emotion";

export type SegmentEditAction = "split" | "push" | "pull";

function appendConstraintToParams(
  constraint: FilterIntent,
  params: URLSearchParams
) {
  if (constraint.type === "column_filter") {
    params.append("filter_type", "column");
    params.append("filter_field", constraint.column);
    params.append("filter_query", constraint.query);
  } else if (constraint.type === "duration_filter") {
    params.append("filter_type", "duration");
    params.append("filter_operator", constraint.operator);
    params.append("filter_seconds", constraint.seconds.toString());
  } else if (constraint.type === "text_search" && constraint.query) {
    params.append("filter_type", "text");
    params.append("filter_query", constraint.query);
  } else if (constraint.type === "queued_filter") {
    // If a nested filter was passed (e.g. /dj :q :tag rock), unwrap the inner filter
    if (constraint.filter.type === "column_filter") {
      params.append("filter_type", "column");
      params.append("filter_field", constraint.filter.column);
      params.append("filter_query", constraint.filter.query);
    } else if (
      constraint.filter.type === "text_search" &&
      constraint.filter.query
    ) {
      params.append("filter_type", "text");
      params.append("filter_query", constraint.filter.query);
    }
  }
}

export const sinatraApi = {
  getStreamUrl(trackId: string): string {
    return `${API_BASE_URL}/api/audio/${encodeURIComponent(trackId)}`;
  },

  async getLibraryTracks(): Promise<Track[]> {
    const res = await fetch(`${API_BASE_URL}/api/library/tracks`);
    if (!res.ok) {
      throw new Error(`Failed to fetch library tracks: ${res.statusText}`);
    }
    return res.json();
  },

  async getTrackSegments(trackId: string): Promise<TrackSegment[]> {
    const res = await fetch(
      `${API_BASE_URL}/api/library/tracks/${encodeURIComponent(trackId)}/segments`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch track segments: ${res.statusText}`);
    }

    return res.json();
  },

  async updateTrackMetadata(
    trackId: string,
    fields: MetadataFields
  ): Promise<void> {
    const res = await fetch(
      `${API_BASE_URL}/api/library/tracks/${encodeURIComponent(trackId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      }
    );

    if (!res.ok) {
      throw new Error(`Failed to update track metadata: ${res.statusText}`);
    }
  },

  async getSimilarTracks(
    trackId: string,
    excludeIds: string[] = [],
    limit: number = 3,
    constraint: FilterIntent | null = null,
    mode: SimilarityMode = "acoustics"
  ): Promise<Track[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
      mode: mode,
    });

    if (excludeIds.length > 0) {
      params.append("stoplist", excludeIds.join(","));
    }

    if (constraint) {
      appendConstraintToParams(constraint, params);
    }

    const res = await fetch(
      `${API_BASE_URL}/api/library/tracks/similar/${encodeURIComponent(
        trackId
      )}?${params.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch similar tracks: ${res.statusText}`);
    }
    return res.json();
  },

  async getTagSuggestions(
    trackId: string,
    threshold: number = 0.5
  ): Promise<SuggestTagsResponse> {
    const params = new URLSearchParams({
      threshold: threshold.toString(),
    });

    const res = await fetch(
      `${API_BASE_URL}/api/suggestions/tags/${encodeURIComponent(
        trackId
      )}?${params.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to fetch tag suggestions: ${res.statusText}`);
    }

    return res.json();
  },

  async searchLyrics(query: string): Promise<TrackLyricMatch[]> {
    const params = new URLSearchParams({
      q: query,
    });

    const res = await fetch(
      `${API_BASE_URL}/api/library/lyrics/search?${params.toString()}`
    );

    if (!res.ok) {
      throw new Error(`Failed to search lyrics: ${res.statusText}`);
    }

    return res.json();
  },

  async patchTrackSegments(
    trackId: string,
    action: SegmentEditAction,
    timestamp: number
  ): Promise<TrackSegment[]> {
    const res = await fetch(
      `${API_BASE_URL}/api/library/tracks/${encodeURIComponent(trackId)}/segments`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, timestamp }),
      }
    );
  
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || `Failed to edit segments: ${res.statusText}`);
    }
  
    return res.json();
  }
};
