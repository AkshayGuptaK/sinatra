const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const sinatraApi = {
  /**
   * Returns the absolute streaming URL for a given track ID.
   */
  getStreamUrl(trackId: string): string {
    return `${API_BASE_URL}/api/audio/${encodeURIComponent(trackId)}`;
  },
};
