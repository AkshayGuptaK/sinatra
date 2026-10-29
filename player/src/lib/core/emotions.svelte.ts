import {
  COWEN_EMOTION_COLORS,
  LYRIC_EMOTION_COLORS,
} from "$lib/constants/emotions";
import type { Track } from "$lib/types/track";

export type EmotionMode = "audio_emotion" | "lyrics_emotion";

export interface MapCoordinates {
  x: number;
  y: number;
}

export interface MapViewDefinition {
  id: EmotionMode;
  label: string;
  description: string;
  getEmotions: (track: Track) => Record<string, number> | null;
  getCoordinates: (track: Track) => MapCoordinates | null;
  getColor: (emotion: string) => string;
}

/** Registry of available 2D map projections */
export const EMOTION_MAP: Record<EmotionMode, MapViewDefinition> = {
  audio_emotion: {
    id: "audio_emotion",
    label: "Audio Mood",
    description: "Acoustic emotion manifold projected via MERT and UMAP",
    getEmotions: (track) => track.emotions,
    getCoordinates: getAudioEmotionCoords,
    getColor: (emotion) => COWEN_EMOTION_COLORS[emotion],
  },
  lyrics_emotion: {
    id: "lyrics_emotion",
    label: "Lyrics Mood",
    description: "Affective text manifold derived from lyrical content",
    getEmotions: (track) => track.lyrics_emotions,
    getCoordinates: getLyricsEmotionCoords,
    getColor: (emotion) => LYRIC_EMOTION_COLORS[emotion],
  },
};

/** Extract acoustic emotion coordinates (coord_x, coord_y) */
function getAudioEmotionCoords(track: Track): MapCoordinates | null {
  if (
    track.coord_x != null &&
    track.coord_y != null &&
    !Number.isNaN(track.coord_x) &&
    !Number.isNaN(track.coord_y)
  ) {
    return { x: track.coord_x, y: track.coord_y };
  }
  return null;
}

/** Extract lyrical emotion coordinates from [x, y] tuple */
function getLyricsEmotionCoords(track: Track): MapCoordinates | null {
  const raw = track.lyrics_emotions_coords;
  if (
    Array.isArray(raw) &&
    raw.length >= 2 &&
    raw[0] != null &&
    raw[1] != null &&
    !Number.isNaN(raw[0]) &&
    !Number.isNaN(raw[1])
  ) {
    return { x: Number(raw[0]), y: Number(raw[1]) };
  }
  return null;
}

export function sortEmotions(emotions: Record<string, number> | null) {
  if (!emotions) return []
  return Object.entries(emotions)
    .map(([name, score]) => ({
      name,
      pct: Math.round(Number(score) * 100),
    }))
    .filter((e) => e.pct > 30)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 10);
}
