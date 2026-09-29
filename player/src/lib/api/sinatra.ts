import type { Track } from "$lib/types/track";
import type { MetadataFields } from "$lib/types/metadata";
import type { FilterIntent } from "$lib/utils/commandParser";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function appendConstraintToParams(
  constraint: FilterIntent,
  params: URLSearchParams
) {
  if (constraint.type === "column_filter") {
    params.append("filter_type", "column");
    params.append("filter_field", constraint.column);
    params.append("filter_query", constraint.query);
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
  /**
   * Fetches similar tracks excluding those already in the queue.
   */
  async getSimilarTracks(
    trackId: string,
    excludeIds: string[] = [],
    limit: number,
    constraint: FilterIntent | null = null
  ): Promise<Track[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    });

    if (excludeIds.length > 0) {
      params.append("stoplist", excludeIds.join(","));
    }

    if (constraint) {
      appendConstraintToParams(constraint, params)
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
};
