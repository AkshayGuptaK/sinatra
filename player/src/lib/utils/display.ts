import type { Track } from "$lib/types/track";

export function getTrackDisplayTitle(track: Track | null): string {
  if (!track) return "";
  return track.title || "Unknown";
}

export function getTrackDisplayAttribution(track: Track | null): string {
  if (!track) return "";
  return track.artist || track.album || "";
}
