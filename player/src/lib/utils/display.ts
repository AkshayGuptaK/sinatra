import type { Track } from "$lib/types/track";

export function trackDisplay(track: Track | null) {
  if (!track) return { title: "", by: "" };
  return {
    title: track.title || "Unknown",
    by: track.artist || track.album || "",
  };
}
