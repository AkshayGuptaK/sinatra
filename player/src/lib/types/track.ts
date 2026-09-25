import type { MakeNonNullable } from "./utils";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  mood: string;
  tags: string[];
  duration: number;
  emotions: Record<string, number> | null;
  // 2D manifold projection coordinates
  coord_x: number | null;
  coord_y: number | null;
}

export type ProjectableTrack = MakeNonNullable<Track, "coord_x" | "coord_y">;

export function isTrackWithCoordinates(
  track: Track
): track is ProjectableTrack {
  return track.coord_x !== null && track.coord_y !== null;
}
