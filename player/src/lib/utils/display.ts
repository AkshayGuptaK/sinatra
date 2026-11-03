import type { QueuedTrack } from "$lib/types/track";

export function getTrackDisplayTitle(track: QueuedTrack | null): string {
  if (!track) return "";
  return track.title || "Unknown";
}

export function getTrackDisplayAttribution(track: QueuedTrack | null): string {
  if (!track) return "";
  return track.artist || track.album || "";
}
