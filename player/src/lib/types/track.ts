import type { MakeNonNullable } from "./utils";

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  mood: string;
  duration: number;
  tags: string[];
  lyrics?: string;
  start: number;
  end: number;
  rms_env?: number[];
  emotions: Record<string, number> | null;
  coord_x: number | null;
  coord_y: number | null;
  lyrics_emotions: Record<string, number> | null;
  lyrics_emotions_coords: [number, number] | null;
}

export type ProjectableTrack = MakeNonNullable<LibraryTrack, "coord_x" | "coord_y">;

export type QueuedTrack = Pick<LibraryTrack, "id" | "title" | "artist" | "album" | "start" | "end" | "duration" | "rms_env"> & {
  source?: string
}

export interface TrackSegment {
  start_sec: number;
  end_sec: number;
  emotions: Record<string, number>;
}

export function isTrackWithCoordinates(
  track: LibraryTrack
): track is ProjectableTrack {
  return track.coord_x !== null && track.coord_y !== null;
}
