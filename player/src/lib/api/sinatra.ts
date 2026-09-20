const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export interface MapPoint {
	id: string;
	display_name: string;
	x: number;
	y: number;
	dominant_emotion: string;
	hover_html: string;
}

export const sinatraApi = {
	/**
	 * Returns the absolute streaming URL for a given track ID.
	 * Matches FastAPI route: @app.get("/api/map/audio/{track_id}")
	 */
	getStreamUrl(trackId: string): string {
		return `${API_BASE_URL}/api/map/audio/${encodeURIComponent(trackId)}`;
	},

	/**
	 * Fetches 2D coordinates and mood summaries for library tracks.
	 * Matches FastAPI route: @app.get("/api/library/map-data")
	 */
	async getMapData(): Promise<MapPoint[]> {
		const res = await fetch(`${API_BASE_URL}/api/library/map-data`);
		if (!res.ok) {
			throw new Error(`Failed to fetch map data: ${res.status} ${res.statusText}`);
		}
		return res.json();
	}
};