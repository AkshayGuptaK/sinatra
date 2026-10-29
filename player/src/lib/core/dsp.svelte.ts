export interface AttachedMediaSource {
  sourceNode: MediaElementAudioSourceNode;
  gainNode: GainNode;
}

export interface DspVisualizerMetrics {
  bands: number[]; // 8-band logarithmic spectrum [0..1]
  bassImpulse: number; // Smoothed positive bass transient [0..1]
  spectralFlux: number; // Timbre change acceleration [0..1]
  trebleEnergy: number; // Average energy across high bands [0..1]
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
  private prevFreqData: Uint8Array | null = null;
  private smoothedBassImpulse = 0;

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

  getVisualizerMetrics(): DspVisualizerMetrics {
    this.init();
    if (!this.analyserNode || !this.freqDataArray) {
      return {
        bands: new Array(8).fill(0),
        bassImpulse: 0,
        spectralFlux: 0,
        trebleEnergy: 0,
      };
    }

    this.analyserNode.getByteFrequencyData(this.freqDataArray);
    const current = this.freqDataArray;
    const totalBins = current.length; // 64
    const activeBins = Math.floor(totalBins * 0.75); // ~16kHz

    // 1. Calculate 8 Logarithmic Bands
    const bands = this.getFrequencyBands(8);

    // 2. Compute Bass Impulse (Positive delta of bands 0 & 1)
    const currentBass = (bands[0] + bands[1]) * 0.5;
    const prevBass = this.prevFreqData
      ? (this.prevFreqData[1] + this.prevFreqData[2]) / 510
      : currentBass;
    const rawBassDelta = Math.max(0, currentBass - prevBass);
    // Fast attack, smooth decay
    this.smoothedBassImpulse = Math.max(
      rawBassDelta,
      this.smoothedBassImpulse * 0.88
    );

    // 3. Compute Half-Wave Rectified Spectral Flux
    let fluxSum = 0;
    if (this.prevFreqData) {
      for (let k = 1; k < activeBins; k++) {
        const diff = (current[k] - this.prevFreqData[k]) / 255.0;
        if (diff > 0) fluxSum += diff * diff;
      }
    }
    const spectralFlux = Math.min(1.0, (fluxSum / activeBins) * 8.0);

    // 4. Treble Presence (Average of highest 2 bands)
    const trebleEnergy = (bands[6] + bands[7]) * 0.5;

    // Cache frame buffer
    if (!this.prevFreqData) this.prevFreqData = new Uint8Array(totalBins);
    this.prevFreqData.set(current);

    return {
      bands,
      bassImpulse: this.smoothedBassImpulse,
      spectralFlux,
      trebleEnergy,
    };
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
