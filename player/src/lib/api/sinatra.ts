import type { Track } from "$lib/types/track";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const sinatraApi = {
  /**
   * Returns the absolute streaming URL for a given track ID.
   */
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
};
