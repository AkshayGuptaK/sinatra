import { sinatraApi } from "$lib/api/sinatra";
import { settings } from "$lib/core/settings.svelte";

interface AudioDeck {
  audio: HTMLAudioElement;
  sourceNode: MediaElementAudioSourceNode | null;
  gainNode: GainNode | null;
  trackId: string | null;
}

export interface NextTrack {
  id: string;
  start: number;
  end: number;
}

const FADE_PLAY_PAUSE_SEC = 0.7;
const FADE_ANTI_POP_SEC = 0.02;
const FADE_SEEK_SEC = 0.03;
const PRELOAD_LOOKAHEAD_SEC = 2.5;
const GAPLESS_SCHEDULE_WINDOW_SEC = 1.0;
const GAPLESS_IMMEDIATE_THRESHOLD_SEC = 0.05;

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

  // Timers & transition state
  private isTransitioning = false;
  private gaplessTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;

  // Reactive playback state (for the currently active deck)
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  isLooping = $state(false);

  currentTrackId = $state<string | null>(null);
  currentMusicStart = $state<number>(0);
  currentMusicEnd = $state<number | null>(null);

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

  /** Invoked when approaching end to fetch next track info for seamless handoff */
  getNextTrack: (() => NextTrack | null) | null = null;

  /** Invoked when crossfade or gapless transition starts playing the next track */
  onTrackAdvanced: (() => void) | null = null;

  /** Invoked when playback terminates naturally at queue end */
  onTrackEnded: (() => void) | null = null;

  constructor() {
    if (typeof window !== "undefined") {
      this.initDecks();

      // Reactively apply live settings changes without waiting for next track load
      $effect.root(() => {
        $effect(() => {
          const _ = this.normalizationEnabled;
          this.syncNormalizationRouting();
        });

        $effect(() => {
          const deviceId = this.outputDeviceId;
          if (deviceId) {
            this.setOutputDevice(deviceId);
          }
        });
      });
    }
  }

  private initDecks() {
    for (let i = 0; i < 2; i++) {
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
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
      const now = this.ctx.currentTime;
      this.compressorNode.threshold.setValueAtTime(-24, now);
      this.compressorNode.knee.setValueAtTime(30, now);
      this.compressorNode.ratio.setValueAtTime(3, now);
      this.compressorNode.attack.setValueAtTime(0.003, now);
      this.compressorNode.release.setValueAtTime(0.25, now);

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
    this.normalizerGain.gain.cancelScheduledValues(now);
    this.bypassGain.gain.cancelScheduledValues(now);

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
      if (
        index === this.activeDeckIdx &&
        !this.isTransitioning &&
        !this.pauseTimer
      ) {
        this.isPlaying = false;
      }
    });

    audio.addEventListener("loadedmetadata", () => {
      if (index === this.activeDeckIdx) {
        this.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
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

  // --- Deck & Gain Helpers ---

  private setDeckGainImmediate(deck: AudioDeck, value: number) {
    if (!this.ctx || !deck.gainNode) return;
    const now = this.ctx.currentTime;
    deck.gainNode.gain.cancelScheduledValues(now);
    deck.gainNode.gain.setValueAtTime(value, now);
  }

  private rampDeckGain(
    deck: AudioDeck,
    from: number,
    to: number,
    durationSec: number
  ) {
    if (!this.ctx || !deck.gainNode) return;
    const now = this.ctx.currentTime;
    deck.gainNode.gain.cancelScheduledValues(now);
    deck.gainNode.gain.setValueAtTime(from, now);
    deck.gainNode.gain.linearRampToValueAtTime(to, now + durationSec);
  }

  private safeSeekDeck(deck: AudioDeck, targetSeconds: number) {
    if (targetSeconds <= 0) return;

    const applySeek = () => {
      try {
        deck.audio.currentTime = targetSeconds;
      } catch (e) {
        console.warn("Could not cue deck to target time:", e);
      }
    };

    if (deck.audio.readyState >= 1) {
      applySeek();
    } else {
      deck.audio.addEventListener("loadedmetadata", applySeek, { once: true });
    }
  }

  private preloadDeck(deck: AudioDeck, track: NextTrack, cueStart = false) {
    if (deck.trackId !== track.id) {
      deck.trackId = track.id;
      deck.audio.src = sinatraApi.getStreamUrl(track.id);
      deck.audio.load();
    }
    if (cueStart && track.start > 0) {
      this.safeSeekDeck(deck, track.start);
    }
  }

  private promoteStandbyDeck(next: NextTrack) {
    this.activeDeckIdx = 1 - this.activeDeckIdx;
    const active = this.activeDeck;

    this.currentTrackId = next.id;
    this.currentMusicStart = next.start;
    this.currentMusicEnd = next.end;
    this.currentTime = active.audio.currentTime;
    this.duration = Number.isFinite(active.audio.duration)
      ? active.audio.duration
      : 0;
    this.isPlaying = !active.audio.paused;

    this.onTrackAdvanced?.();
  }

  private clearAllTimers() {
    if (this.gaplessTimer) {
      clearTimeout(this.gaplessTimer);
      this.gaplessTimer = null;
    }
    if (this.transitionTimer) {
      clearTimeout(this.transitionTimer);
      this.transitionTimer = null;
    }
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }
    if (this.seekTimer) {
      clearTimeout(this.seekTimer);
      this.seekTimer = null;
    }
  }

  private cancelActiveTransitions() {
    this.clearAllTimers();
    if (this.isTransitioning) {
      const standby = this.standbyDeck;
      standby.audio.pause();
      standby.audio.currentTime = 0;
      this.setDeckGainImmediate(standby, 1);
      this.isTransitioning = false;
    }
  }

  // --- Transition Evaluation & Execution ---

  private get crossfadeDuration(): number {
    if (this.transitionMode === "crossfade_3s") return 3;
    if (this.transitionMode === "crossfade_5s") return 5;
    return 0;
  }

  private checkTransitionTrigger(current: number, total: number) {
    if (
      !Number.isFinite(total) ||
      total <= 0 ||
      this.isTransitioning ||
      this.isLooping
    ) {
      return;
    }

    const isGapless = this.transitionMode === "gapless";
    const effectiveEnd =
      isGapless && this.currentMusicEnd && this.currentMusicEnd > 0
        ? Math.min(this.currentMusicEnd, total)
        : total;

    const remaining = effectiveEnd - current;
    const xfadeSec = this.crossfadeDuration;

    // 1. Preload upcoming track ahead of any transition window
    const preloadWindow = Math.max(xfadeSec + 2, PRELOAD_LOOKAHEAD_SEC);
    if (remaining <= preloadWindow) {
      const next = this.getNextTrack?.();
      if (!next) return;

      const shouldCueStart = isGapless || xfadeSec > 0;
      this.preloadDeck(this.standbyDeck, next, shouldCueStart);

      // 2. Crossfade Trigger
      if (xfadeSec > 0 && remaining <= xfadeSec) {
        this.executeCrossfade(next, xfadeSec);
        return;
      }

      // 3. Gapless Trigger
      if (isGapless) {
        if (remaining <= GAPLESS_IMMEDIATE_THRESHOLD_SEC) {
          this.executeGaplessHandoff(next);
        } else if (
          remaining <= GAPLESS_SCHEDULE_WINDOW_SEC &&
          !this.gaplessTimer
        ) {
          const delayMs = Math.max(0, remaining * 1000);
          this.gaplessTimer = setTimeout(() => {
            this.gaplessTimer = null;
            if (this.isPlaying && !this.isTransitioning) {
              const target = this.getNextTrack?.();
              if (target) this.executeGaplessHandoff(target);
            }
          }, delayMs);
        }
      }
    }
  }

  private async executeGaplessHandoff(next: NextTrack) {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    if (this.gaplessTimer) {
      clearTimeout(this.gaplessTimer);
      this.gaplessTimer = null;
    }

    const outgoing = this.activeDeck;
    const incoming = this.standbyDeck;

    this.preloadDeck(incoming, next, true);
    this.setDeckGainImmediate(incoming, 1);

    try {
      await incoming.audio.play();
    } catch (e) {
      console.error("Gapless playback handoff failed:", e);
      this.isTransitioning = false;
      return;
    }

    outgoing.audio.pause();
    outgoing.audio.currentTime = 0;

    this.promoteStandbyDeck(next);
    this.isTransitioning = false;
  }

  private async executeCrossfade(next: NextTrack, durationSec: number) {
    if (!this.ctx || this.isTransitioning) return;
    this.isTransitioning = true;

    if (this.gaplessTimer) {
      clearTimeout(this.gaplessTimer);
      this.gaplessTimer = null;
    }

    const outgoing = this.activeDeck;
    const incoming = this.standbyDeck;

    this.preloadDeck(incoming, next, true);
    this.setDeckGainImmediate(incoming, 0);

    try {
      await incoming.audio.play();
    } catch (e) {
      console.warn("Crossfade playback error:", e);
      this.isTransitioning = false;
      return;
    }

    // Linear crossfade gain ramps
    this.rampDeckGain(incoming, 0, 1, durationSec);
    this.rampDeckGain(outgoing, 1, 0, durationSec);

    this.promoteStandbyDeck(next);

    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      this.transitionTimer = null;
      outgoing.audio.pause();
      outgoing.audio.currentTime = 0;
      this.setDeckGainImmediate(outgoing, 1);
      this.isTransitioning = false;
    }, durationSec * 1000);
  }

  // --- Transport Controls ---

  async loadTrack(track: NextTrack, autoPlay = true) {
    this.initContext();
    this.syncNormalizationRouting();
    this.cancelActiveTransitions();

    // If standby deck already preloaded this exact track, swap to it instead of re-fetching
    if (
      this.standbyDeck.trackId === track.id &&
      this.standbyDeck.audio.readyState >= 2
    ) {
      this.activeDeck.audio.pause();
      this.activeDeck.audio.currentTime = 0;
      this.activeDeckIdx = 1 - this.activeDeckIdx;
    }

    const deck = this.activeDeck;
    this.currentTrackId = track.id;
    this.currentMusicStart = track.start;
    this.currentMusicEnd = track.end;

    this.preloadDeck(deck, track, this.transitionMode === "gapless");
    this.setDeckGainImmediate(deck, 1);

    if (autoPlay) {
      await this.play();
    }
  }

  async play() {
    this.initContext();
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }

    const deck = this.activeDeck;
    if (!deck.audio) return;

    const rampTime = this.fadeEnabled ? FADE_PLAY_PAUSE_SEC : FADE_ANTI_POP_SEC;

    if (deck.gainNode && this.ctx) {
      this.setDeckGainImmediate(deck, 0);
      await deck.audio.play();
      this.rampDeckGain(deck, 0, 1, rampTime);
    } else {
      await deck.audio.play();
    }

    this.isPlaying = true;
  }

  pause() {
    if (this.gaplessTimer) {
      clearTimeout(this.gaplessTimer);
      this.gaplessTimer = null;
    }
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }

    const deck = this.activeDeck;
    if (!deck.audio) return;

    const rampTime = this.fadeEnabled ? FADE_PLAY_PAUSE_SEC : FADE_ANTI_POP_SEC;

    if (deck.gainNode && this.ctx) {
      this.rampDeckGain(deck, 1, 0, rampTime);

      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = null;
        deck.audio.pause();
        this.setDeckGainImmediate(deck, 1);
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
    if (this.gaplessTimer) {
      clearTimeout(this.gaplessTimer);
      this.gaplessTimer = null;
    }
    if (this.seekTimer) {
      clearTimeout(this.seekTimer);
      this.seekTimer = null;
    }

    const deck = this.activeDeck;
    if (!deck.audio) return;

    const target = Math.min(
      Math.max(timeInSeconds, 0),
      this.duration || Infinity
    );

    if (this.fadeEnabled && deck.gainNode && this.ctx && this.isPlaying) {
      this.rampDeckGain(deck, 1, 0, FADE_SEEK_SEC);
      this.seekTimer = setTimeout(() => {
        this.seekTimer = null;
        deck.audio.currentTime = target;
        this.currentTime = target;
        this.rampDeckGain(deck, 0, 1, FADE_SEEK_SEC);
      }, FADE_SEEK_SEC * 1000);
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
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(val, now);
    } else {
      for (const deck of this.decks) {
        deck.audio.volume = val;
      }
    }
  }

  async setOutputDevice(deviceId: string) {
    for (const deck of this.decks) {
      if ("setSinkId" in deck.audio) {
        try {
          await (
            deck.audio as HTMLAudioElement & {
              setSinkId: (id: string) => Promise<void>;
            }
          ).setSinkId(deviceId);
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

      const avg = count > 0 ? sum / count / 255 : 0;
      const highBoost = 1 + (i / barCount) * 0.6;
      bands.push(Math.min(1.0, avg * highBoost));
    }

    return bands;
  }
}
