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
  acoustic_emotions: Record<string, number> | null;
  acoustic_emotion_coords: [number, number] | null;
  lyrical_emotions: Record<string, number> | null;
  lyrical_emotion_coords: [number, number] | null;
}

export type ProjectableTrack = MakeNonNullable<LibraryTrack, "acoustic_emotion_coords">;

export type QueuedTrack = Pick<LibraryTrack, "id" | "title" | "artist" | "album" | "start" | "end" | "duration" | "rms_env"> & {
  source?: string
}

export interface TrackSegment {
  start_sec: number;
  end_sec: number;
  acoustic_emotions: Record<string, number>;
}

export function isTrackWithCoordinates(
  track: LibraryTrack
): track is ProjectableTrack {
  return track.acoustic_emotion_coords !== null;
}
