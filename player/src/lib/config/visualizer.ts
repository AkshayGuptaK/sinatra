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

export type VisualizerQualityPreset = "battery" | "balanced" | "high" | "ultra";

export interface PerformanceConfig {
  /** Target render FPS: 30, 60, or 0 (uncapped / native display refresh) */
  targetFps: number;
  /** Active particle count drawn on screen */
  particleCount: number;
  /** Jacobi pressure solver iterations (higher = stiffer incompressibility) */
  pressureIterations: number;
  /** Simulation velocity grid resolution (power of 2) */
  simRes: 128 | 256;
  /** Visible dye resolution (power of 2) */
  dyeRes: 512 | 1024;
  /** Max Device Pixel Ratio clamp (1.0 saves significant GPU fill-rate on 4K/Retina) */
  maxDpr: number;
}

export const VISUALIZER_PERFORMANCE_PRESETS: Record<
  VisualizerQualityPreset,
  PerformanceConfig
> = {
  battery: {
    targetFps: 30,
    particleCount: 6_400,
    pressureIterations: 12,
    simRes: 128,
    dyeRes: 512,
    maxDpr: 1.0,
  },
  balanced: {
    targetFps: 60,
    particleCount: 16_000,
    pressureIterations: 18,
    simRes: 256,
    dyeRes: 1024,
    maxDpr: 1.25,
  },
  high: {
    targetFps: 60,
    particleCount: 25_600,
    pressureIterations: 22,
    simRes: 256,
    dyeRes: 1024,
    maxDpr: 1.5,
  },
  ultra: {
    targetFps: 0, // Native display refresh (e.g., 120Hz)
    particleCount: 40_000,
    pressureIterations: 26,
    simRes: 256,
    dyeRes: 1024,
    maxDpr: 2.0,
  },
};

// ============================================================================
// Declarative Choreography Configuration (Tune All Visual Behavior Here)
// ============================================================================

export interface ChoreographyConfig {
  /**
   * Temporal smoothing for affective metadata.
   * Prevents abrupt visual cuts when the track crosses segment boundaries.
   */
  interpolation: {
    /**
     * Duration in seconds for exponential smoothing of the arousal score (0.0 to 1.0).
     * Lower values (0.3s) react snappily to mood shifts; higher values (2.0s) yield gradual transitions.
     */
    arousalLerpSeconds: number;

    /**
     * Duration in seconds for cross-fading active emotion RGB colors and their mass weights.
     * Higher values (1.0s - 2.5s) ensure colors bleed into each other without hard color snapping.
     */
    colorLerpSeconds: number;
  };

  /**
   * Global simulation clock multipliers (time dilation).
   * Dictates how fast the Navier-Stokes velocity and advection steps tick forward.
   */
  pacing: {
    /**
     * Simulation speed multiplier when arousal is 0.0 (calm, meditative tracks).
     * Typical: 0.25 - 0.5. Produces slow-motion, drifting atmospheric smoke.
     */
    minTimeScale: number;

    /**
     * Simulation speed multiplier when arousal is 1.0 (aggressive, energizing tracks).
     * Typical: 1.0 - 1.5. Speeds up fluid turbulence and rapid eddy formation.
     */
    maxTimeScale: number;

    /**
     * Simulation speed multiplier while playback is paused.
     * Typical: 0.05 - 0.15. Allows existing plumes to gently coast to a stop rather than freezing.
     */
    pausedTimeScale: number;
  };

  /**
   * Primary continuous dye and velocity emitters.
   * Maps active segment emotion colors into physical fluid sources on canvas.
   */
  emitters: {
    /**
     * Spatial trajectory algorithm:
     * - 'stationary': Emitters stay fixed at anchor points around the canvas center.
     * - 'drift': Emitters wander organic multi-sine paths (natural, non-repetitive).
     * - 'orbit': Emitters revolve in smooth circular paths around the canvas center.
     */
    movementMode: "stationary" | "drift" | "orbit";

    /**
     * Base distance of emitters from the center (0.5, 0.5) in UV coordinates [0.0 - 0.5].
     * 0.0 places all sources dead center; 0.25 places them in a mid-canvas perimeter ring.
     */
    anchorRadius: number;

    /**
     * Frequency multiplier for emitter movement along their paths.
     * Higher values speed up spatial repositioning; lower values keep them localized.
     */
    driftSpeed: number;

    /**
     * Angular fan arc of dye injection in degrees [0 - 360]:
     * - 360: Full omnidirectional radial bloom (cloud welling outward like dropped ink).
     * - 180: Broad forward hemicycle fan.
     * - 0 - 30: Focused directional jet or steam nozzle.
     */
    spreadDeg: number;

    /**
     * Number of discrete directional sub-splats distributed across `spreadDeg`.
     * 1 creates a single linear vector; 4 to 8 smoothly fills a wide fan or 360° circle.
     */
    spreadLobes: number;

    /**
     * Outward velocity injection speed at 0.0 arousal (in simulation grid units/sec).
     * Lower values (20 - 40) make calm music softly billow; higher values cause forced jet streams.
     */
    minSpeed: number;

    /**
     * Outward velocity injection speed at 1.0 arousal (in simulation grid units/sec).
     * Typical: 120 - 200. Governs how fast energetic choruses propel fluid across the screen.
     */
    maxSpeed: number;

    /**
     * Influence multiplier of live track RMS loudness [0.0 - 1.0] on injection speed.
     * Increases velocity when the track gets louder.
     */
    rmsSpeedWeight: number;

    /**
     * Influence multiplier of the bass transient impulse (d(Bass)/dt) on injection speed.
     * Injects an instantaneous speed surge on kick drums and bass slaps.
     */
    bassSpeedWeight: number;

    /**
     * Baseline plume thickness (variance sigma^2 in UV coordinate space).
     * Typical: 0.001 - 0.003. Smaller values produce razor-thin filament ribbons; larger values produce soft clouds.
     */
    baseRadius: number;

    /**
     * Dynamic expansion of plume thickness scaled by live RMS loudness.
     * Widens the smoke tendrils during loud passages and narrows them during quiet breaks.
     */
    rmsRadiusWeight: number;

    /**
     * Baseline opacity / dye density added per frame before audio boost.
     * Too high saturates the screen too quickly; too low makes smoke faint and transparent.
     */
    baseDyeIntensity: number;

    /**
     * Additional dye density injected in proportion to live RMS loudness.
     * Causes louder music to release denser, richer plumes of color.
     */
    rmsDyeWeight: number;
  };

  /**
   * Transient physical shockwaves triggered by drum beats and percussive hits.
   */
  pulse: {
    /** Master toggle for bass-triggered radial shockwaves. */
    enabled: boolean;

    /**
     * Minimum instantaneous bass attack (d(Bass)/dt) required to fire a pulse [0.0 - 1.0].
     * Higher thresholds (0.25+) trigger only on prominent kick drums; lower thresholds (0.10) trigger on basslines.
     */
    bassThreshold: number;

    /**
     * Angular coverage of the bass shockwave in degrees.
     * Typically 360 to expand as a concentric circular ripple from the center.
     */
    spreadDeg: number;

    /**
     * Number of radial vectors used to build the shockwave ring.
     * 6 to 8 creates a uniform circular pressure wave.
     */
    lobes: number;

    /**
     * Force multiplier applied to the radial velocity impulse.
     * Governs how violently existing smoke plumes curl and displace when a beat drops.
     */
    speedMultiplier: number;

    /**
     * Spatial footprint (radius variance sigma^2) of the shockwave pulse splat.
     */
    radius: number;
  };

  /**
   * Navier-Stokes differential equation parameters and thermodynamic controls.
   */
  physics: {
    /**
     * Base vorticity confinement scale at 0.0 arousal.
     * Lower values (2 - 6) suppress curls, yielding smooth, laminar, parallel ribbons.
     */
    minVorticity: number;

    /**
     * Base vorticity confinement scale at 1.0 arousal.
     * Higher values (24 - 40) inject aggressive rotational curl, creating churning, chaotic vortices.
     */
    maxVorticity: number;

    /**
     * Vorticity boost triggered by real-time Spectral Flux (rate of timbral reshuffling).
     * Sudden snare cracks or guitar attacks momentarily scramble the fluid into tight eddies.
     */
    spectralFluxVorticityWeight: number;

    /**
     * Amount added to dye dissipation when arousal is low (pushes dissipation closer to 1.0).
     * Allows smoke to linger, float, and remain suspended for 10+ seconds on serene tracks.
     */
    calmLingeringBoost: number;

    /**
     * Velocity damping added when arousal is low (reduces momentum retention).
     * Prevents plumes on calm tracks from skating across the frame, settling them in place.
     */
    calmViscosityDamping: number;
  };

  /**
   * Lagrangian dust particles (stardust) advected by the fluid velocity field.
   */
  particles: {
    /**
     * Normalized particle opacity multiplier at 0.0 arousal.
     * Keeps dust faint and subdued during quiet or ambient tracks.
     */
    minArousalDensity: number;

    /**
     * Normalized particle opacity multiplier at 1.0 arousal.
     * Renders crisp, bright fields of dust during energetic tracks.
     */
    maxArousalDensity: number;

    /**
     * Base vertex point diameter on screen in logical pixels before DPR scaling.
     * Typical: 1.5 - 2.5.
     */
    basePointSize: number;

    /**
     * Point size expansion scaled by high-frequency FFT energy (shakers, hi-hats, cymbals).
     * Causes micro-particles to flare in size on treble transients.
     */
    trebleSizeBoost: number;

    /**
     * Alpha luminescence boost scaled by high-frequency FFT energy.
     * Makes dust particles sparkle and glisten in time with percussion.
     */
    trebleAlphaBoost: number;
  };
}

export const DEFAULT_CHOREOGRAPHY_CONFIG: ChoreographyConfig = {
  interpolation: {
    arousalLerpSeconds: 2.0,
    colorLerpSeconds: 0.8,
  },
  pacing: {
    minTimeScale: 0.25, // Calm songs move in slow-motion
    maxTimeScale: 1.0, // Energetic songs move at full speed
    pausedTimeScale: 0.08,
  },
  emitters: {
    movementMode: "drift",
    anchorRadius: 0.14,
    driftSpeed: 0.2, // Very slow, organic wandering
    spreadDeg: 350, // Wide fan/bloom by default (set to 360 for full circle, 45 for jet)
    spreadLobes: 4, // 4 soft overlapping lobes across the arc
    minSpeed: 30.0, // Gentle welling up when calm
    maxSpeed: 120.0, // Energetic surge when high arousal
    rmsSpeedWeight: 0.45,
    bassSpeedWeight: 0.55,
    baseRadius: 0.0018,
    rmsRadiusWeight: 0.0022,
    baseDyeIntensity: 0.06,
    rmsDyeWeight: 0.14,
  },
  pulse: {
    enabled: true,
    bassThreshold: 0.16,
    spreadDeg: 360, // Bass kicks expand outward in a 360-deg ring
    lobes: 6,
    speedMultiplier: 130.0,
    radius: 0.002,
  },
  physics: {
    minVorticity: 4.0, // Laminar, silky ribbons when calm
    maxVorticity: 28.0, // Turbulent eddies when energetic
    spectralFluxVorticityWeight: 22.0,
    calmLingeringBoost: 0.011, // Pushes 0.985 dissipation -> 0.996 when arousal is 0
    calmViscosityDamping: 0.015,
  },
  particles: {
    minArousalDensity: 0.05,
    maxArousalDensity: 0.4,
    basePointSize: 1.0,
    trebleSizeBoost: 2.0,
    trebleAlphaBoost: 0.75,
  },
};
