import type { MakeNonNullable } from "./utils";

export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  mood: string;
  tags: string[];
  start: number;
  end: number;
  duration: number;
  emotions: Record<string, number> | null;
  coord_x: number | null;
  coord_y: number | null;
  lyrics_emotions: Record<string, number> | null;
  lyrics_emotions_coords: [number, number] | null;
}

export type ProjectableTrack = MakeNonNullable<Track, "coord_x" | "coord_y">;

export interface TrackSegment {
  chunk_index: number;
  start_sec: number;
  end_sec: number;
  emotions_normalized: Record<string, number>;
}

export function isTrackWithCoordinates(
  track: Track
): track is ProjectableTrack {
  return track.coord_x !== null && track.coord_y !== null;
}
