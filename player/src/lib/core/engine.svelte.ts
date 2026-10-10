import { sinatraApi } from "$lib/api/sinatra";

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

  private analyserNode: AnalyserNode | null = null;
  private freqDataArray: Uint8Array | null = null;

  /** Callback invoked when playback ends and engine-level looping is disabled */
  onTrackEnded: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.audio = new Audio();
      this.audio.crossOrigin = "anonymous";
      this.setupListeners();
    }
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioContextClass();

      if (this.audio) {
        this.sourceNode = this.ctx.createMediaElementSource(this.audio);
        this.gainNode = this.ctx.createGain();

        this.analyserNode = this.ctx.createAnalyser();
        this.analyserNode.fftSize = 128;
        this.analyserNode.smoothingTimeConstant = 0.8;
        this.freqDataArray = new Uint8Array(
          this.analyserNode.frequencyBinCount
        );

        this.sourceNode.connect(this.gainNode);
        this.gainNode.connect(this.analyserNode);
        this.analyserNode.connect(this.ctx.destination);
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  private setupListeners() {
    if (!this.audio) return;

    this.audio.addEventListener("play", () => {
      this.isPlaying = true;
    });

    this.audio.addEventListener("pause", () => {
      this.isPlaying = false;
    });

    this.audio.addEventListener("timeupdate", () => {
      if (this.audio) {
        this.currentTime = this.audio.currentTime;
      }
    });

    this.audio.addEventListener("loadedmetadata", () => {
      if (this.audio) {
        this.duration = this.audio.duration;
      }
    });

    this.audio.addEventListener("ended", () => {
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
      console.error("Audio playback failed or blocked:", e);
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
    const target = Math.min(
      Math.max(timeInSeconds, 0),
      this.duration || Infinity
    );
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

  /**
   * Returns logarithmically scaled frequency bands [0.0 - 1.0].
   * Bins are distributed exponentially across octaves to match human hearing.
   */
  getFrequencyBands(barCount: number = 4): number[] {
    if (!this.analyserNode || !this.freqDataArray || !this.isPlaying) {
      return new Array(barCount).fill(0);
    }

    this.analyserNode.getByteFrequencyData(this.freqDataArray);

    const totalBins = this.freqDataArray.length; // 64
    // Discard sub-rumble (<30Hz) and ultrasonic noise (>16kHz)
    const minBin = 1;
    const maxBin = Math.floor(totalBins * 0.75); // ~16kHz
    const bands: number[] = [];

    for (let i = 0; i < barCount; i++) {
      // Logarithmic distribution across frequency spectrum
      const startIdx = Math.floor(
        minBin * Math.pow(maxBin / minBin, i / barCount)
      );
      const endIdx = Math.max(
        startIdx + 1,
        Math.floor(minBin * Math.pow(maxBin / minBin, (i + 1) / barCount))
      );

      let sum = 0;
      let count = 0;
      for (let j = startIdx; j < endIdx && j < maxBin; j++) {
        sum += this.freqDataArray[j];
        count++;
      }

      let avg = count > 0 ? sum / count / 255 : 0;

      // High frequency emphasis: treble naturally has less physical amplitude than bass
      // boost progressively towards the highest bar
      const highBoost = 1 + (i / barCount) * 0.6;
      avg = Math.min(1.0, avg * highBoost);

      bands.push(avg);
    }

    return bands;
  }
}
