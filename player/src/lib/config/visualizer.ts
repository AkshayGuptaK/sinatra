import { COWEN_EMOTION_COLORS } from "$lib/constants/emotions";

export type FluidStyle = "smoke" | "water" | "oil";

export interface FluidStyleParams {
  viscosity: number; // Velocity damping (0.95 = heavy oil, 0.995 = thin smoke)
  vorticityMultiplier: number; // Tendency to curl (low for oil, high for smoke)
  dyeDissipation: number; // Dye fade rate (0.999 = persistent ink, 0.96 = evaporating vapor)
  edgeSharpness: number; // 0.0 = soft smoke gradient, 1.0 = crisp liquid boundary
  particleDensity: number; // Particle count multiplier (0.0 = pure liquid, 1.0 = stardust)
}

export const FLUID_PRESETS: Record<FluidStyle, FluidStyleParams> = {
  smoke: {
    viscosity: 0.995,
    vorticityMultiplier: 2.2,
    dyeDissipation: 0.985,
    edgeSharpness: 0.0,
    particleDensity: 1.0,
  },
  water: {
    viscosity: 0.982,
    vorticityMultiplier: 1.2,
    dyeDissipation: 0.992,
    edgeSharpness: 0.5,
    particleDensity: 0.4,
  },
  oil: {
    viscosity: 0.96,
    vorticityMultiplier: 0.4,
    dyeDissipation: 0.998,
    edgeSharpness: 0.85,
    particleDensity: 0.1,
  },
};

/**
 * Configurable Arousal Classification.
 * Add, remove, or rebalance emotions across high vs. low arousal sets.
 */
export const AROUSAL_CONFIG = {
  highArousalEmotions: new Set([
    "energizing/pump-up",
    "angry",
    "indignant/defiant",
    "anxious/tense",
    "joyful/cheerful",
  ]),
  lowArousalEmotions: new Set([
    "calm/relaxing/serene",
    "sad/depressing",
    "dreamy",
    "beautiful",
  ]),
  neutralEmotions: new Set([
    "amusing",
    "annoying",
    "erotic/desirous",
    "scary/fearful",
  ]),
};

/**
 * Dynamic Transfer Function Connectors.
 * Easily tweak how raw audio inputs scale into shader uniforms.
 */
export const VISUALIZER_TRANSFER_MAP = {
  // Maps bass kick impulse [0..1] to outward fluid pressure
  bassToImpulse: (bassDelta: number) => Math.pow(bassDelta, 1.3) * 35.0,

  // Maps spectral flux [0..1] to transient vorticity injection
  fluxToVorticity: (flux: number) => Math.min(flux * 45.0, 30.0),

  // Maps RMS [0..1] to global flow speed and emission radius
  rmsToEmissionRadius: (rms: number) => 0.08 + rms * 0.18,
  rmsToFlowSpeed: (rms: number) => 0.6 + rms * 1.4,

  // Maps high FFT bands (treble) to particle sparkle size and brightness
  trebleToSparkle: (trebleAvg: number) => ({
    sizeMultiplier: 1.0 + trebleAvg * 2.5,
    alphaMultiplier: 0.3 + trebleAvg * 0.7,
  }),
};
