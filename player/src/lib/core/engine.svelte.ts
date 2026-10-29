import { sinatraApi } from "$lib/api/sinatra";
import { settings } from "$lib/core/settings.svelte";
import type { TrackSegment } from "$lib/types/track";
import { AudioDspGraph } from "./dsp.svelte";
import { TrackSegmentManager } from "./segments.svelte";

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
  rms_env: number[];
}

const FADE_PLAY_SEC = 0.7;
const FADE_PAUSE_SEC = 0.5;
const FADE_ANTI_POP_SEC = 0.02;
const FADE_SEEK_SEC = 0.03;
const PRELOAD_LOOKAHEAD_SEC = 2.5;
const GAPLESS_SCHEDULE_WINDOW_SEC = 1.0;
const GAPLESS_IMMEDIATE_THRESHOLD_SEC = 0.05;

export class AudioEngine {
  readonly dsp = new AudioDspGraph();
  readonly segmentManager: TrackSegmentManager;

  private decks: AudioDeck[] = [];
  private activeDeckIdx = 0;

  // Transition & Timer State
  private isTransitioning = false;
  private gaplessTimer: ReturnType<typeof setTimeout> | null = null;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;

  // Reactive playback state
  isPlaying = $state(false);
  currentTime = $state(0);
  duration = $state(0);
  isLooping = $state(false);

  currentTrackId = $state<string | null>(null);
  currentMusicStart = $state<number>(0);
  currentMusicEnd = $state<number | null>(null);
  currentRmsEnv = $state<number[] | null>(null);

  // Settings
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

  // Delegate Callbacks
  getNextTrack: (() => NextTrack | null) | null = null;
  onTrackAdvanced: (() => void) | null = null;
  onTrackEnded: (() => void) | null = null;

  constructor() {
    this.segmentManager = new TrackSegmentManager(
      () => this.currentTrackId,
      () => this.currentTime,
      (sec) => this.seekTo(sec)
    );

    if (typeof window !== "undefined") {
      this.initDecks();

      $effect.root(() => {
        $effect(() => {
          this.dsp.syncNormalization(this.normalizationEnabled);
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

  // --- Facade Getters & Methods (Preserves Call-Site Compatibility) ---

  get segments(): TrackSegment[] {
    return this.segmentManager.items;
  }

  get currentSegmentIndex(): number {
    return this.segmentManager.currentIndex;
  }

  get currentSegment(): TrackSegment | null {
    return this.segmentManager.current;
  }

  get isLoadingSegments(): boolean {
    return this.segmentManager.isLoading;
  }

  get isEditingSegments(): boolean {
    return this.segmentManager.isEditing;
  }

  get segmentEditError(): string | null {
    return this.segmentManager.error;
  }

  get canSplitSegment(): boolean {
    return this.segmentManager.canSplit;
  }

  get canPushSegment(): boolean {
    return this.segmentManager.canPush;
  }

  get canPullSegment(): boolean {
    return this.segmentManager.canPull;
  }

  splitSegmentAtCurrentTime = () => this.segmentManager.split();
  pushSegmentToCurrentTime = () => this.segmentManager.push();
  pullSegmentToCurrentTime = () => this.segmentManager.pull();
  skipToNextSegment = () => this.segmentManager.skipToNext();
  skipToPrevSegment = () => this.segmentManager.skipToPrev();

  getFrequencyBands(barCount = 4): number[] {
    return this.dsp.getFrequencyBands(barCount, this.isPlaying);
  }

  // --- Deck Initializers ---

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

  private ensureDeckNodesAttached() {
    this.dsp.init();
    for (const deck of this.decks) {
      if (!deck.sourceNode) {
        const attached = this.dsp.attachMediaElement(deck.audio);
        if (attached) {
          deck.sourceNode = attached.sourceNode;
          deck.gainNode = attached.gainNode;
        }
      }
    }
  }

  private get activeDeck(): AudioDeck {
    return this.decks[this.activeDeckIdx];
  }

  private get standbyDeck(): AudioDeck {
    return this.decks[1 - this.activeDeckIdx];
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

  // --- Deck Utilities ---

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
    this.currentRmsEnv = next.rms_env;
    this.currentTime = active.audio.currentTime;
    this.duration = Number.isFinite(active.audio.duration)
      ? active.audio.duration
      : 0;
    this.isPlaying = !active.audio.paused;

    // Load segments for the newly promoted active track
    this.segmentManager.loadForTrack(next.id);
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
      this.dsp.setGainImmediate(standby.gainNode, 1);
      this.isTransitioning = false;
    }
  }

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

    const preloadWindow = Math.max(xfadeSec + 2, PRELOAD_LOOKAHEAD_SEC);
    if (remaining <= preloadWindow) {
      const next = this.getNextTrack?.();
      if (!next) return;

      const shouldCueStart = isGapless || xfadeSec > 0;
      this.preloadDeck(this.standbyDeck, next, shouldCueStart);

      if (xfadeSec > 0 && remaining <= xfadeSec) {
        this.executeCrossfade(next, xfadeSec);
        return;
      }

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
    this.dsp.setGainImmediate(incoming.gainNode, 1);

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
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    if (this.gaplessTimer) {
      clearTimeout(this.gaplessTimer);
      this.gaplessTimer = null;
    }

    const outgoing = this.activeDeck;
    const incoming = this.standbyDeck;

    this.preloadDeck(incoming, next, true);
    this.dsp.setGainImmediate(incoming.gainNode, 0);

    try {
      await incoming.audio.play();
    } catch (e) {
      console.warn("Crossfade playback error:", e);
      this.isTransitioning = false;
      return;
    }

    this.dsp.rampGain(incoming.gainNode, 0, 1, durationSec);
    this.dsp.rampGain(outgoing.gainNode, 1, 0, durationSec);

    this.promoteStandbyDeck(next);

    if (this.transitionTimer) clearTimeout(this.transitionTimer);
    this.transitionTimer = setTimeout(() => {
      this.transitionTimer = null;
      outgoing.audio.pause();
      outgoing.audio.currentTime = 0;
      this.dsp.setGainImmediate(outgoing.gainNode, 1);
      this.isTransitioning = false;
    }, durationSec * 1000);
  }

  // --- Transport Controls ---

  async loadTrack(track: NextTrack, autoPlay = true) {
    this.ensureDeckNodesAttached();
    this.cancelActiveTransitions();

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
    this.currentRmsEnv = track.rms_env;

    this.preloadDeck(deck, track, this.transitionMode === "gapless");
    this.dsp.setGainImmediate(deck.gainNode, 1);

    this.segmentManager.loadForTrack(track.id);

    if (autoPlay) {
      await this.play();
    }
  }

  async play() {
    this.ensureDeckNodesAttached();
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
      this.pauseTimer = null;
    }

    const deck = this.activeDeck;
    if (!deck.audio) return;

    const rampTime = this.fadeEnabled ? FADE_PLAY_SEC : FADE_ANTI_POP_SEC;

    if (deck.gainNode) {
      this.dsp.setGainImmediate(deck.gainNode, 0);
      await deck.audio.play();
      this.dsp.rampGain(deck.gainNode, 0, 1, rampTime);
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

    const rampTime = this.fadeEnabled ? FADE_PAUSE_SEC : FADE_ANTI_POP_SEC;

    if (deck.gainNode) {
      this.dsp.rampGain(deck.gainNode, 1, 0, rampTime);

      this.pauseTimer = setTimeout(() => {
        this.pauseTimer = null;
        deck.audio.pause();
        this.dsp.setGainImmediate(deck.gainNode, 1);
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

    if (this.fadeEnabled && deck.gainNode && this.isPlaying) {
      this.dsp.rampGain(deck.gainNode, 1, 0, FADE_SEEK_SEC);
      this.seekTimer = setTimeout(() => {
        this.seekTimer = null;
        deck.audio.currentTime = target;
        this.currentTime = target;
        this.dsp.rampGain(deck.gainNode, 0, 1, FADE_SEEK_SEC);
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
    if (this.dsp.isInitialized) {
      this.dsp.setMasterVolume(val);
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
}
