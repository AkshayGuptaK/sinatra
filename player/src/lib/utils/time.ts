export function formatTime(seconds: number): string {
	console.log("Formatting", seconds)
	if (!isFinite(seconds) || isNaN(seconds) || seconds < 0) {
		return '0:00';
	}

	const totalSeconds = Math.floor(seconds);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const remainingSeconds = totalSeconds % 60;

	const paddedSeconds = remainingSeconds.toString().padStart(2, '0');

	if (hours > 0) {
		const paddedMinutes = minutes.toString().padStart(2, '0');
		return `${hours}:${paddedMinutes}:${paddedSeconds}`;
	}

	return `${minutes}:${paddedSeconds}`;
}