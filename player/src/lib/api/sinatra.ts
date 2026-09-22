import type { Track } from "$lib/types/track";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

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
  /**
   * Fetches similar tracks excluding those already in the queue.
   */
  async getSimilarTracks(
    trackId: string,
    excludeIds: string[] = [],
    limit: number = 3
  ): Promise<Track[]> {
    const params = new URLSearchParams({
      limit: limit.toString(),
    });

    if (excludeIds.length > 0) {
      params.append("stoplist", excludeIds.join(","));
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
