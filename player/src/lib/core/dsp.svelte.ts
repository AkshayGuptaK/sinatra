export interface AttachedMediaSource {
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
}

export class AudioDspGraph {
  private ctx: AudioContext | null = null;
  private inputBus: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;
  private normalizerGain: GainNode | null = null;
  private bypassGain: GainNode | null = null;
  private masterGain: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private freqDataArray: Uint8Array | null = null;

  get isInitialized(): boolean {
    return this.ctx !== null;
  }

  get currentTime(): number {
    return this.ctx?.currentTime ?? 0;
  }

  init() {
    if (this.ctx || typeof window === "undefined") {
      this.resume();
      return;
    }

    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new AudioContextClass();

    // 1. Master Graph Bus
    this.inputBus = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();

    // 2. Normalizer (DynamicsCompressor) Chain
    this.compressorNode = this.ctx.createDynamicsCompressor();
    const now = this.ctx.currentTime;
    this.compressorNode.threshold.setValueAtTime(-24, now);
    this.compressorNode.knee.setValueAtTime(30, now);
    this.compressorNode.ratio.setValueAtTime(3, now);
    this.compressorNode.attack.setValueAtTime(0.003, now);
    this.compressorNode.release.setValueAtTime(0.25, now);

    this.normalizerGain = this.ctx.createGain();
    this.bypassGain = this.ctx.createGain();

    // Input -> Compressor -> NormalizerGain -> MasterGain
    this.inputBus.connect(this.compressorNode);
    this.compressorNode.connect(this.normalizerGain);
    this.normalizerGain.connect(this.masterGain);

    // Input -> BypassGain -> MasterGain
    this.inputBus.connect(this.bypassGain);
    this.bypassGain.connect(this.masterGain);

    // 3. Analyser Node for FFT visualization
    this.analyserNode = this.ctx.createAnalyser();
    this.analyserNode.fftSize = 128;
    this.analyserNode.smoothingTimeConstant = 0.8;
    this.freqDataArray = new Uint8Array(this.analyserNode.frequencyBinCount);

    this.masterGain.connect(this.analyserNode);
    this.analyserNode.connect(this.ctx.destination);

    this.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Connects an HTMLMediaElement into the input bus and returns its dedicated gain node.
   */
  attachMediaElement(audio: HTMLAudioElement): AttachedMediaSource | null {
    this.init();
    if (!this.ctx || !this.inputBus) return null;

    const sourceNode = this.ctx.createMediaElementSource(audio);
    const gainNode = this.ctx.createGain();

    sourceNode.connect(gainNode);
    gainNode.connect(this.inputBus);

    return { sourceNode, gainNode };
  }

  /**
   * Smoothly switches between compressed and bypassed gain paths.
   */
  syncNormalization(enabled: boolean) {
    if (!this.ctx || !this.normalizerGain || !this.bypassGain) return;
    const now = this.ctx.currentTime;

    this.normalizerGain.gain.cancelScheduledValues(now);
    this.bypassGain.gain.cancelScheduledValues(now);

    if (enabled) {
      this.normalizerGain.gain.setValueAtTime(1, now);
      this.bypassGain.gain.setValueAtTime(0, now);
    } else {
      this.normalizerGain.gain.setValueAtTime(0, now);
      this.bypassGain.gain.setValueAtTime(1, now);
    }
  }

  setMasterVolume(val: number) {
    if (!this.masterGain || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setValueAtTime(val, now);
  }

  setGainImmediate(node: GainNode | null, value: number) {
    if (!this.ctx || !node) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(value, now);
  }

  rampGain(
    node: GainNode | null,
    from: number,
    to: number,
    durationSec: number
  ) {
    if (!this.ctx || !node) return;
    const now = this.ctx.currentTime;
    node.gain.cancelScheduledValues(now);
    node.gain.setValueAtTime(from, now);
    node.gain.linearRampToValueAtTime(to, now + durationSec);
  }

  getFrequencyBands(barCount = 4, isPlaying = false): number[] {
    if (!this.analyserNode || !this.freqDataArray || !isPlaying) {
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
