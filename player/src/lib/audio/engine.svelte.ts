import { sinatraApi } from '$lib/api/sinatra';

export class AudioEngine {
	private audio: HTMLAudioElement | null = null;
	private ctx: AudioContext | null = null;
	private sourceNode: MediaElementAudioSourceNode | null = null;
	private gainNode: GainNode | null = null;

	isPlaying = $state(false);
	currentTime = $state(0);
	duration = $state(0);
	isLooping = $state(false);
	currentTrackId = $state<string | null>(null);

	/** Callback invoked when playback ends and engine-level looping is disabled */
	onTrackEnded: (() => void) | null = null;

	constructor() {
		if (typeof window !== 'undefined') {
			this.audio = new Audio();
			this.audio.crossOrigin = 'anonymous';
			this.setupListeners();
		}
	}

	private initContext() {
		if (!this.ctx && typeof window !== 'undefined') {
			const AudioContextClass =
				window.AudioContext ||
				(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
			this.ctx = new AudioContextClass();

			if (this.audio) {
				this.sourceNode = this.ctx.createMediaElementSource(this.audio);
				this.gainNode = this.ctx.createGain();

				this.sourceNode.connect(this.gainNode);
				this.gainNode.connect(this.ctx.destination);
			}
		}

		if (this.ctx && this.ctx.state === 'suspended') {
			this.ctx.resume();
		}
	}

	private setupListeners() {
		if (!this.audio) return;

		this.audio.addEventListener('play', () => {
			this.isPlaying = true;
		});

		this.audio.addEventListener('pause', () => {
			this.isPlaying = false;
		});

		this.audio.addEventListener('timeupdate', () => {
			if (this.audio) {
				this.currentTime = this.audio.currentTime;
			}
		});

		this.audio.addEventListener('loadedmetadata', () => {
			if (this.audio) {
				this.duration = this.audio.duration;
			}
		});

		this.audio.addEventListener('ended', () => {
			if (!this.isLooping) {
				this.isPlaying = false;
				this.onTrackEnded?.();
			}
		});
	}

	async loadTrack(trackId: string, autoPlay = true) {
		this.initContext();
		if (!this.audio) return;

		this.currentTrackId = trackId;
		this.audio.src = sinatraApi.getStreamUrl(trackId);
		this.audio.load();

		if (autoPlay) {
			await this.play();
		}
	}

	async play() {
		this.initContext();
		if (!this.audio) return;
		try {
			await this.audio.play();
		} catch (e) {
			console.error('Audio playback failed or blocked:', e);
		}
	}

	pause() {
		if (!this.audio) return;
		this.audio.pause();
	}

	togglePlay() {
		if (this.isPlaying) {
			this.pause();
		} else {
			this.play();
		}
	}

	seekRelative(deltaSeconds: number) {
		if (!this.audio) return;
		const nextTime = Math.min(
			Math.max(this.audio.currentTime + deltaSeconds, 0),
			this.duration || Infinity
		);
		this.audio.currentTime = nextTime;
		this.currentTime = nextTime;
	}

	seekTo(timeInSeconds: number) {
		if (!this.audio) return;
		const target = Math.min(Math.max(timeInSeconds, 0), this.duration || Infinity);
		this.audio.currentTime = target;
		this.currentTime = target;
	}

	setLoop(loop: boolean) {
		this.isLooping = loop;
		if (this.audio) {
			this.audio.loop = loop;
		}
	}

	setVolume(val: number) {
		if (this.gainNode && this.ctx) {
			this.gainNode.gain.setValueAtTime(val, this.ctx.currentTime);
		} else if (this.audio) {
			this.audio.volume = val;
		}
	}
}