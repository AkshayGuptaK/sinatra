export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  const paddedSeconds = remainingSeconds.toString().padStart(2, "0");

  if (hours > 0) {
    const paddedMinutes = minutes.toString().padStart(2, "0");
    return `${hours}:${paddedMinutes}:${paddedSeconds}`;
  }

  return `${minutes}:${paddedSeconds}`;
}

export function parseDurationToSeconds(time: string): number | null {
  const clean = time.trim().toLowerCase();
  if (!clean) return null;

  const unitMatch = clean.match(
    /^(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+(?:\.\d+)?)s)?$/
  );
  if (unitMatch && (unitMatch[1] || unitMatch[2] || unitMatch[3])) {
    const hours = Number(unitMatch[1] || 0);
    const minutes = Number(unitMatch[2] || 0);
    const seconds = Number(unitMatch[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
  }

  const rawNum = Number(clean);
  return isNaN(rawNum) ? null : rawNum;
}
