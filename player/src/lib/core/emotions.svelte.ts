import {
  COWEN_EMOTION_COLORS,
  LYRIC_EMOTION_COLORS,
} from "$lib/constants/emotions";
import type { LibraryTrack } from "$lib/types/track";

export type EmotionMode = "audio_emotion" | "lyrics_emotion";

export interface MapCoordinates {
  x: number;
  y: number;
}

export interface MapViewDefinition {
  id: EmotionMode;
  label: string;
  description: string;
  getEmotions: (track: LibraryTrack) => Record<string, number> | null;
  getCoordinates: (track: LibraryTrack) => MapCoordinates | null;
  getColor: (emotion: string) => string;
}

/** Registry of available 2D map projections */
export const EMOTION_MAP: Record<EmotionMode, MapViewDefinition> = {
  audio_emotion: {
    id: "audio_emotion",
    label: "Audio Mood",
    description: "Acoustic emotion manifold projected via MERT and UMAP",
    getEmotions: (track) => track.acoustic_emotions,
    getCoordinates: getAudioEmotionCoords,
    getColor: (emotion) => COWEN_EMOTION_COLORS[emotion],
  },
  lyrics_emotion: {
    id: "lyrics_emotion",
    label: "Lyrics Mood",
    description: "Affective text manifold derived from lyrical content",
    getEmotions: (track) => track.lyrical_emotions,
    getCoordinates: getLyricsEmotionCoords,
    getColor: (emotion) => LYRIC_EMOTION_COLORS[emotion],
  },
};

function getAudioEmotionCoords(track: LibraryTrack): MapCoordinates | null {
  if (track.acoustic_emotion_coords != null) {
    return {
      x: track.acoustic_emotion_coords[0],
      y: track.acoustic_emotion_coords[1],
    };
  }
  return null;
}

function getLyricsEmotionCoords(track: LibraryTrack): MapCoordinates | null {
  const raw = track.lyrical_emotion_coords;
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
  if (!emotions) return [];
  return Object.entries(emotions)
    .map(([name, score]) => ({
      name,
      pct: Math.round(Number(score) * 100),
    }))
    .filter((e) => e.pct > 10)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 9);
}
