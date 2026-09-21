import { sinatraApi } from '$lib/api/sinatra';

import { AudioEngine } from './engine.svelte';

export interface Track {
	id: string;
	title?: string;
	artist?: string;
	duration?: number;
}

export type LoopMode = 'none' | 'one' | 'all';

export class MusicPlayer {
	readonly engine: AudioEngine;

	// Reactive Queue State
	queue = $state<Track[]>([]);
	currentIndex = $state<number>(-1);
	isShuffle = $state(false);
	loopMode = $state<LoopMode>('none');

	// Internal record to restore queue order when un-shuffling
	private originalQueue: Track[] = [];

    currentTrack = $derived(
		this.currentIndex >= 0 && this.currentIndex < this.queue.length
			? this.queue[this.currentIndex]
			: null
	);

	currentTrackId = $derived(this.currentTrack?.id ?? null);

	hasNext = $derived(
		this.loopMode === 'all'
			? this.queue.length > 0
			: this.currentIndex < this.queue.length - 1
	);
	hasPrevious = $derived(
		this.loopMode === 'all'
			? this.queue.length > 0
			: this.currentIndex > 0
	);

	constructor() {
		this.engine = new AudioEngine();
		this.engine.onTrackEnded = () => this.handleTrackEnded();
	}

	private handleTrackEnded() {
		if (this.hasNext) {
			this.next();
		} else {
			this.engine.pause();
		}
	}

	setQueue(tracks: Track[], startIndex = 0, autoPlay = true) {
		this.originalQueue = [...tracks];
		this.queue = [...tracks];
		this.currentIndex = startIndex;

		if (this.isShuffle) {
			this.applyShuffleOrder(startIndex);
		}

		const currentId = this.currentTrackId;
		if (currentId) {
			this.engine.loadTrack(currentId, autoPlay);
		}
	}

    clearQueue() {
        this.originalQueue = [];
        this.queue = [];
        this.currentIndex = -1;
        this.engine.pause();
        this.engine.seekTo(0);
    }

	enqueue(track: Track) {
		this.originalQueue.push(track);
		this.queue.push(track);

		// If nothing is playing, kick off playback with the new track
		if (this.currentIndex === -1) {
			this.currentIndex = 0;
			this.engine.loadTrack(track.id, true);
		}
	}

	async playTrackAtIndex(index: number) {
		if (index < 0 || index >= this.queue.length) return;
		this.currentIndex = index;
		const track = this.queue[index];
		await this.engine.loadTrack(track.id, true);
	}

	async next() {
		if (this.queue.length === 0) return;

		if (this.currentIndex + 1 < this.queue.length) {
			await this.playTrackAtIndex(this.currentIndex + 1);
		} else if (this.loopMode === 'all') {
			await this.playTrackAtIndex(0);
		}
	}

	async previous() {
		if (this.queue.length === 0) return;

		// If track has been playing for > 3s, restart track rather than jump backward
		if (this.engine.currentTime > 3) {
			this.engine.seekTo(0);
			return;
		}

		if (this.currentIndex > 0) {
			await this.playTrackAtIndex(this.currentIndex - 1);
		} else if (this.loopMode === 'all') {
			await this.playTrackAtIndex(this.queue.length - 1);
		} else {
			this.engine.seekTo(0);
		}
	}

	toggleShuffle() {
		this.isShuffle = !this.isShuffle;

		if (this.queue.length <= 1) return;

		const activeTrack = this.currentTrack;

		if (this.isShuffle) {
			this.applyShuffleOrder(this.currentIndex);
		} else {
			// Restore original queue order while keeping active index in sync
			this.queue = [...this.originalQueue];
			this.currentIndex = activeTrack ? this.queue.findIndex(track => track.id === activeTrack.id) : 0;
		}
	}

	private applyShuffleOrder(preserveIndex: number) {
		const activeTrack = this.queue[preserveIndex];
		const remaining = this.queue.filter((_, i) => i !== preserveIndex);

		// Fisher-Yates shuffle on remaining tracks
		for (let i = remaining.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[remaining[i], remaining[j]] = [remaining[j], remaining[i]];
		}

		this.queue = activeTrack ? [activeTrack, ...remaining] : remaining;
		this.currentIndex = 0;
	}

	setLoopMode(mode: LoopMode) {
		this.loopMode = mode;
		this.engine.setLoop(mode === 'one');
	}

	cycleLoopMode() {
		const modes: LoopMode[] = ['none', 'all', 'one'];
		const nextIdx = (modes.indexOf(this.loopMode) + 1) % modes.length;
		this.setLoopMode(modes[nextIdx]);
	}
}

// Global player singleton instance
export const player = new MusicPlayer();