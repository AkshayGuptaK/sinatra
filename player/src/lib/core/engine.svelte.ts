import { sinatraApi } from "$lib/api/sinatra";
import { settings } from "$lib/core/settings.svelte";

interface AudioDeck {
  audio: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null;
  gainNode: GainNode | null;
  trackId: string | null;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private decks: AudioDeck[] = [];
  private activeDeckIdx = 0; // 0 or 1

  // Web Audio Graph nodes
  private inputBus: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private normalizerGain: GainNode | null = null;
  private bypassGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freqDataArray: Uint8Array | null = null;

  // Transition tracking
  private isTransitioning = false;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;

  // Reactive playback state (for the currently active deck)
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  isLooping = $state(false);
  currentTrackId = $state<string | null>(null);

  // Reactive settings subscriptions pulled from store
  fadeEnabled = $derived(Boolean(settings.get("playback.fade") ?? true));
  transitionMode = $derived(
    settings.get<string>("playback.transition") ?? "off"
  );
  normalizationEnabled = $derived(
    Boolean(settings.get("playback.normalization") ?? false)
  );
  outputDeviceId = $derived(
    settings.get<string>("playback.outputDevice") ?? "default"
  );

  /** Invoked when approaching end to fetch next track ID for seamless handoff */
  getNextTrackId: (() => string | null) | null = null;

  /** Invoked when crossfade or gapless transition starts playing the next track */
  onTrackAdvanced: (() => void) | null = null;

  /** Invoked when playback terminates naturally at queue end */
  onTrackEnded: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initDecks();
    }
  }

  private initDecks() {
    for (let i = 0; i < 2; i++) {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      this.decks.push({
        audio,
        sourceNode: null,
        gainNode: null,
        trackId: null,
      });
      this.setupDeckListeners(i);
    }
  }

  private get activeDeck(): AudioDeck {
    return this.decks[this.activeDeckIdx];
  }

  private get standbyDeck(): AudioDeck {
    return this.decks[1 - this.activeDeckIdx];
  }

  private initContext() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioContextClass();

      // Master Graph Setup
      this.inputBus = this.ctx.createGain();
      this.masterGain = this.ctx.createGain();

      // Normalizer (DynamicsCompressor) Chain
      this.compressorNode = this.ctx.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(-24, this.ctx.currentTime);
      this.compressorNode.knee.setValueAtTime(30, this.ctx.currentTime);
      this.compressorNode.ratio.setValueAtTime(3, this.ctx.currentTime);
      this.compressorNode.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.compressorNode.release.setValueAtTime(0.25, this.ctx.currentTime);

      this.normalizerGain = this.ctx.createGain();
      this.bypassGain = this.ctx.createGain();

      // Hook up compressor vs bypass wet/dry paths
      this.inputBus.connect(this.compressorNode);
      this.compressorNode.connect(this.normalizerGain);
      this.normalizerGain.connect(this.masterGain);

      this.inputBus.connect(this.bypassGain);
      this.bypassGain.connect(this.masterGain);

      this.syncNormalizationRouting();

      // Analyser Node
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 128;
      this.analyserNode.smoothingTimeConstant = 0.8;
      this.freqDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

      this.masterGain.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);

      // Connect both decks into the input bus
      for (const deck of this.decks) {
        deck.sourceNode = this.ctx.createMediaElementSource(deck.audio);
        deck.gainNode = this.ctx.createGain();
        deck.sourceNode.connect(deck.gainNode);
        deck.gainNode.connect(this.inputBus);
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  private syncNormalizationRouting() {
    if (!this.ctx || !this.normalizerGain || !this.bypassGain) return;
    const now = this.ctx.currentTime;
    if (this.normalizationEnabled) {
      this.normalizerGain.gain.setValueAtTime(1, now);
      this.bypassGain.gain.setValueAtTime(0, now);
    } else {
      this.normalizerGain.gain.setValueAtTime(0, now);
      this.bypassGain.gain.setValueAtTime(1, now);
    }
  }

  private setupDeckListeners(index: number) {
    const deck = this.decks[index];
    const audio = deck.audio;

    audio.addEventListener("play", () => {
      if (index === this.activeDeckIdx) this.isPlaying = true;
    });

    audio.addEventListener("pause", () => {
      if (index === this.activeDeckIdx && !this.isTransitioning) {
        this.isPlaying = false;
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      if (index === this.activeDeckIdx) {
        this.duration = audio.duration;
      }
    });

    audio.addEventListener("timeupdate", () => {
      if (index === this.activeDeckIdx) {
        this.currentTime = audio.currentTime;
        this.checkTransitionTrigger(audio.currentTime, audio.duration);
      }
    });

    audio.addEventListener("ended", () => {
      if (
        index === this.activeDeckIdx &&
        !this.isLooping &&
        !this.isTransitioning
      ) {
        this.isPlaying = false;
        this.onTrackEnded?.();
      }
    });
  }

  /**
   * Evaluates whether to start preloading or crossfading into the next track.
   */
  private checkTransitionTrigger(current: number, total: number) {
    if (!total || total <= 0 || this.isTransitioning || this.isLooping) return;

    let crossfadeDuration = 0;
    if (this.transitionMode === "crossfade_3s") crossfadeDuration = 3;
    if (this.transitionMode === "crossfade_5s") crossfadeDuration = 5;

    const remaining = total - current;

    // Trigger crossfade early enough to execute smooth blend
    if (crossfadeDuration > 0 && remaining <= crossfadeDuration) {
      const nextId = this.getNextTrackId?.();
      if (nextId) {
        this.executeCrossfade(nextId, crossfadeDuration);
      }
      return;
    }

    // Gapless preloading: pre-buffering next track 2 seconds before boundary
    if (this.transitionMode === "gapless" && remaining <= 2) {
      const nextId = this.getNextTrackId?.();
      const standby = this.standbyDeck;
      if (nextId && standby.trackId !== nextId) {
        standby.trackId = nextId;
        standby.audio.src = sinatraApi.getStreamUrl(nextId);
        standby.audio.load();
      }
    }
  }

  private async executeCrossfade(nextTrackId: string, durationSec: number) {
    if (!this.ctx || this.isTransitioning) return;
    this.isTransitioning = true;

    const outgoing = this.activeDeck;
    const incoming = this.standbyDeck;

    // Prepare incoming deck
    incoming.trackId = nextTrackId;
    incoming.audio.src = sinatraApi.getStreamUrl(nextTrackId);
    incoming.audio.load();

    const now = this.ctx.currentTime;
    incoming.gainNode?.gain.setValueAtTime(0, now);
    outgoing.gainNode?.gain.setValueAtTime(1, now);

    try {
      await incoming.audio.play();
    } catch (e) {
      console.warn("Crossfade playback error:", e);
      this.isTransitioning = false;
      return;
    }

    // Equal-power linear gain curves
    incoming.gainNode?.gain.linearRampToValueAtTime(1, now + durationSec);
    outgoing.gainNode?.gain.linearRampToValueAtTime(0, now + durationSec);

    // Switch active deck pointer
    this.activeDeckIdx = 1 - this.activeDeckIdx;
    this.currentTrackId = nextTrackId;
    this.onTrackAdvanced?.();

    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      outgoing.audio.pause();
      outgoing.audio.currentTime = 0;
      outgoing.gainNode?.gain.setValueAtTime(1, this.ctx?.currentTime ?? 0);
      this.isTransitioning = false;
    }, durationSec * 1000);
  }

  async loadTrack(trackId: string, autoPlay = true) {
    this.initContext();
    this.syncNormalizationRouting();

    const deck = this.activeDeck;
    this.currentTrackId = trackId;
    deck.trackId = trackId;
    deck.audio.src = sinatraApi.getStreamUrl(trackId);
    deck.audio.load();

    if (deck.gainNode && this.ctx) {
      deck.gainNode.gain.setValueAtTime(1, this.ctx.currentTime);
    }

    if (autoPlay) {
      await this.play();
    }
  }

  async play() {
    this.initContext();
    const deck = this.activeDeck;
    if (!deck.audio) return;

    const rampTime = this.fadeEnabled ? 0.8 : 0.03;

    if (deck.gainNode && this.ctx) {
      deck.gainNode.gain.setValueAtTime(0, this.ctx.currentTime);
      await deck.audio.play();

      const now = this.ctx.currentTime;
      deck.gainNode.gain.setValueAtTime(0, now);
      deck.gainNode.gain.linearRampToValueAtTime(1, now + rampTime);
    } else {
      await deck.audio.play();
    }

    this.isPlaying = true;
  }

  pause() {
    const deck = this.activeDeck;
    if (!deck.audio) return;

    const rampTime = this.fadeEnabled ? 0.8 : 0.03;

    if (deck.gainNode && this.ctx) {
      const now = this.ctx.currentTime;
      deck.gainNode.gain.setValueAtTime(1, now);
      deck.gainNode.gain.linearRampToValueAtTime(0, now + rampTime);

      setTimeout(() => {
        deck.audio.pause();
        deck.gainNode?.gain.setValueAtTime(1, this.ctx?.currentTime ?? 0);
        this.isPlaying = false;
      }, rampTime * 1000);
    } else {
      deck.audio.pause();
      this.isPlaying = false;
    }
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  seekTo(timeInSeconds: number) {
    const deck = this.activeDeck;
    if (!deck.audio) return;

    const target = Math.min(
      Math.max(timeInSeconds, 0),
      this.duration || Infinity
    );

    // Micro-fade down/up to avoid pop noise
    if (this.fadeEnabled && deck.gainNode && this.ctx && this.isPlaying) {
      const now = this.ctx.currentTime;
      deck.gainNode.gain.setValueAtTime(1, now);
      deck.gainNode.gain.linearRampToValueAtTime(0, now + 0.03);
      setTimeout(() => {
        deck.audio.currentTime = target;
        this.currentTime = target;
        deck.gainNode?.gain.linearRampToValueAtTime(
          1,
          (this.ctx?.currentTime ?? 0) + 0.03
        );
      }, 30);
    } else {
      deck.audio.currentTime = target;
      this.currentTime = target;
    }
  }

  seekRelative(deltaSeconds: number) {
    this.seekTo(this.currentTime + deltaSeconds);
  }

  setLoop(loop: boolean) {
    this.isLooping = loop;
    for (const deck of this.decks) {
      deck.audio.loop = loop;
    }
  }

  setVolume(val: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(val, this.ctx.currentTime);
    } else {
      for (const deck of this.decks) {
        deck.audio.volume = val;
      }
    }
  }

  /**
   * Switches output device sink ID across all decks and Web Audio destination
   */
  async setOutputDevice(deviceId: string) {
    for (const deck of this.decks) {
      if ("setSinkId" in deck.audio) {
        try {
          await (deck.audio as any).setSinkId(deviceId);
        } catch (e) {
          console.warn("Failed to set sinkId on audio element:", e);
        }
      }
    }
  }

  getFrequencyBands(barCount = 4): number[] {
    if (!this.analyserNode || !this.freqDataArray || !this.isPlaying) {
      return new Array(barCount).fill(0);
    }

    this.analyserNode.getByteFrequencyData(this.freqDataArray);
    const totalBins = this.freqDataArray.length;
    const minBin = 1;
    const maxBin = Math.floor(totalBins * 0.75);
    const bands: number[] = [];

    for (let i = 0; i < barCount; i++) {
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
      const highBoost = 1 + (i / barCount) * 0.6;
      bands.push(Math.min(1.0, avg * highBoost));
    }

    return bands;
  }
}
