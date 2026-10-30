import {
  FLUID_PRESETS,
  VISUALIZER_PERFORMANCE_PRESETS,
  type FluidStyle,
  type FluidStyleParams,
  type PerformanceConfig,
  type VisualizerQualityPreset,
} from "$lib/config/visualizer";
import type { SegmentAffectiveProfile } from "$lib/utils/visualizerPalette";
import type { DspVisualizerMetrics } from "$lib/core/dsp.svelte";
import { FluidSimulationEngine } from "./webGL/simulator";

export interface FluidUpdateArgs {
  dsp: DspVisualizerMetrics;
  rms: number;
  profile: SegmentAffectiveProfile;
  isPlaying: boolean;
}

export interface ColorSource {
  rgb: [number, number, number];
  weight: number;
}

/**
 * Complete snapshot of raw inputs + smoothed state passed to every
 * choreography function so each function can calibrate & decide what it needs.
 */
export interface FrameContext {
  dt: number;
  simDt: number;
  animTime: number;
  aspect: number;
  isPlaying: boolean;
  dsp: DspVisualizerMetrics;
  rms: number; // Raw uncalibrated RMS [0..1]
  profile: SegmentAffectiveProfile;
  smoothedArousal: number; // Smoothed segment arousal [0..1]
  colors: ColorSource[];
  style: FluidStyleParams;
}

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
    maxTimeScale: 1.00, // Energetic songs move at full speed
    pausedTimeScale: 0.08,
  },
  emitters: {
    movementMode: "drift",
    anchorRadius: 0.14,
    driftSpeed: 0.20, // Very slow, organic wandering
    spreadDeg: 300, // Wide fan/bloom by default (set to 360 for full circle, 45 for jet)
    spreadLobes: 4, // 4 soft overlapping lobes across the arc
    minSpeed: 28.0, // Gentle welling up when calm 
    maxSpeed: 145.0, // Energetic surge when high arousal
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

// ============================================================================
// FluidVisualizer (Flexible, Modular Choreographer)
// ============================================================================

export class FluidVisualizer {
  private engine: FluidSimulationEngine;
  private styleParams: FluidStyleParams;
  private perfConfig: PerformanceConfig;
  public config: ChoreographyConfig;

  // Smoothed Internal State
  private currentColors: ColorSource[] = [];
  private currentArousal = 0.3;
  private lastTime = performance.now();
  private animTime = 0;
  private lastCtx: FrameContext | null = null;
  private hasSeededInitialPlume = false;

  constructor(
    canvas: HTMLCanvasElement,
    stylePreset: FluidStyle = "smoke",
    qualityPreset: VisualizerQualityPreset = "balanced",
    customConfig?: Partial<ChoreographyConfig>
  ) {
    this.perfConfig =
      VISUALIZER_PERFORMANCE_PRESETS[qualityPreset] ??
      VISUALIZER_PERFORMANCE_PRESETS.balanced;
    this.engine = new FluidSimulationEngine(canvas);
    this.styleParams = FLUID_PRESETS[stylePreset] ?? FLUID_PRESETS.smoke;
    this.config = { ...DEFAULT_CHOREOGRAPHY_CONFIG, ...customConfig };
  }

  public setStylePreset(preset: FluidStyle) {
    if (FLUID_PRESETS[preset]) {
      this.styleParams = FLUID_PRESETS[preset];
    }
  }

  public setQualityPreset(preset: VisualizerQualityPreset) {
    if (VISUALIZER_PERFORMANCE_PRESETS[preset]) {
      this.perfConfig = VISUALIZER_PERFORMANCE_PRESETS[preset];
      this.engine.setPerformanceConfig(this.perfConfig);
    }
  }

  public getTargetFps(): number {
    return this.perfConfig.targetFps;
  }

  public resize() {
    this.engine.resize();
  }

  public destroy() {
    this.engine.destroy();
  }

  // --------------------------------------------------------------------------
  // Top-Level Coordinator (Only routes context & config to modular functions)
  // --------------------------------------------------------------------------

  public update(args: FluidUpdateArgs) {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    // 1. Update smoothed affective state (colors & arousal)
    this.updateAffectiveState(args.profile, dt);

    // 2. Build unified FrameContext with raw dsp, rms, and profile
    const ctx = this.buildFrameContext(args, dt);
    this.lastCtx = ctx;

    // 3. Seed initial ambient bloom once on startup
    if (!this.hasSeededInitialPlume && ctx.colors.length > 0) {
      this.seedInitialPlume(ctx);
      this.hasSeededInitialPlume = true;
    }

    // 4. Execute Choreography Modules
    if (ctx.isPlaying) {
      this.emitColorBlooms(ctx, this.config.emitters);
      if (this.config.pulse.enabled) {
        this.emitRhythmicPulse(ctx, this.config.pulse);
      }
    }

    // 5. Step Fluid Physics & Particles
    this.stepPhysics(ctx, this.config.physics);
    this.stepParticles(ctx);
  }

  public draw() {
    if (!this.lastCtx) return;
    this.renderFrame(this.lastCtx, this.config.particles);
  }

  // --------------------------------------------------------------------------
  // Module 1: State Interpolation & Context Builder
  // --------------------------------------------------------------------------

  private updateAffectiveState(profile: SegmentAffectiveProfile, dt: number) {
    const arousalLerp =
      1.0 - Math.exp(-dt / this.config.interpolation.arousalLerpSeconds);
    const colorLerp =
      1.0 - Math.exp(-dt / this.config.interpolation.colorLerpSeconds);

    this.currentArousal +=
      (profile.arousalScore - this.currentArousal) * arousalLerp;

    if (this.currentColors.length === 0 && profile.colors.length > 0) {
      this.currentColors = profile.colors.map((c) => ({
        rgb: [...c.rgb],
        weight: c.weight,
      }));
    } else if (profile.colors.length > 0) {
      for (let i = 0; i < profile.colors.length; i++) {
        const target = profile.colors[i];
        if (!this.currentColors[i]) {
          this.currentColors[i] = {
            rgb: [...target.rgb],
            weight: target.weight,
          };
        } else {
          this.currentColors[i].rgb[0] +=
            (target.rgb[0] - this.currentColors[i].rgb[0]) * colorLerp;
          this.currentColors[i].rgb[1] +=
            (target.rgb[1] - this.currentColors[i].rgb[1]) * colorLerp;
          this.currentColors[i].rgb[2] +=
            (target.rgb[2] - this.currentColors[i].rgb[2]) * colorLerp;
          this.currentColors[i].weight +=
            (target.weight - this.currentColors[i].weight) * colorLerp;
        }
      }
      if (this.currentColors.length > profile.colors.length) {
        this.currentColors.length = profile.colors.length;
      }
    }
  }

  private buildFrameContext(args: FluidUpdateArgs, dt: number): FrameContext {
    const { minTimeScale, maxTimeScale, pausedTimeScale } = this.config.pacing;

    // Arousal governs overall time dilation of the fluid world
    const activeTimeScale =
      minTimeScale + this.currentArousal * (maxTimeScale - minTimeScale);
    const simDt = dt * (args.isPlaying ? activeTimeScale : pausedTimeScale);
    this.animTime += simDt;

    return {
      dt,
      simDt,
      animTime: this.animTime,
      aspect: this.engine.getAspect(),
      isPlaying: args.isPlaying,
      dsp: args.dsp,
      rms: args.rms,
      profile: args.profile,
      smoothedArousal: this.currentArousal,
      colors: this.currentColors,
      style: this.styleParams,
    };
  }

  // --------------------------------------------------------------------------
  // Module 2: Configurable Multi-Angle Color Emitters
  // --------------------------------------------------------------------------

  private emitColorBlooms(
    ctx: FrameContext,
    cfg: ChoreographyConfig["emitters"]
  ) {
    const { dsp, rms, smoothedArousal, colors, aspect, animTime } = ctx;
    if (colors.length === 0) return;

    // Calibrate inputs locally inside the function
    const effectiveRms = Math.max(0.08, rms);
    const midEnergy =
      ((dsp.bands[2] ?? 0) + (dsp.bands[3] ?? 0) + (dsp.bands[4] ?? 0)) / 3;

    // Ensure at least 2 sources so single-emotion segments still gently fold together
    const sources: ColorSource[] =
      colors.length === 1
        ? [
            { rgb: colors[0].rgb, weight: 0.55 },
            {
              rgb: [
                Math.min(1, colors[0].rgb[0] * 1.15 + 0.04),
                Math.min(1, colors[0].rgb[1] * 0.92 + 0.03),
                Math.min(1, colors[0].rgb[2] * 1.15 + 0.05),
              ],
              weight: 0.45,
            },
          ]
        : colors;

    // Outward speed is anchored by arousal first, then modulated by RMS and Bass
    const arousalBaseSpeed =
      cfg.minSpeed + smoothedArousal * (cfg.maxSpeed - cfg.minSpeed);
    const audioBoost =
      1.0 +
      effectiveRms * cfg.rmsSpeedWeight +
      dsp.bassImpulse * cfg.bassSpeedWeight;
    const totalSpeed = arousalBaseSpeed * audioBoost;

    const spreadRad = (cfg.spreadDeg * Math.PI) / 180;
    const lobes = Math.max(1, cfg.spreadLobes);

    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const [x, y, baseAimAngle] = this.computeEmitterTransform(
        i,
        sources.length,
        animTime,
        midEnergy,
        cfg
      );

      const lobeRadius =
        (cfg.baseRadius + effectiveRms * cfg.rmsRadiusWeight) *
        (0.65 + src.weight * 0.6);

      const frameRateScale = ctx.dt * 60.0; // Normalizes 30fps vs 60fps vs 120fps injection

      // Dye brightness scales with RMS and emotion proportion, divided across lobes
      const totalDyeIntensity =
        ((cfg.baseDyeIntensity + effectiveRms * cfg.rmsDyeWeight) *
          (0.5 + src.weight * 0.7) *
          frameRateScale) /
        Math.sqrt(lobes);

      const dyeRgb: [number, number, number] = [
        src.rgb[0] * totalDyeIntensity,
        src.rgb[1] * totalDyeIntensity,
        src.rgb[2] * totalDyeIntensity,
      ];

      // Fan out across `spreadDeg` (from 0 deg laser up to 360 deg omnidirectional bloom)
      for (let l = 0; l < lobes; l++) {
        const lobeFraction =
          lobes === 1 ? 0 : l / (lobes === 1 ? 1 : lobes) - 0.5;
        const angle =
          cfg.spreadDeg >= 360
            ? baseAimAngle + (l * 2 * Math.PI) / lobes
            : baseAimAngle + lobeFraction * spreadRad;

        const lobeSpeed = totalSpeed * (0.6 + src.weight * 0.5);
        const velX = Math.cos(angle) * lobeSpeed;
        const velY = Math.sin(angle) * lobeSpeed;

        // Slight spatial offset per lobe so 360 blooms expand from a soft ring
        const offsetX = x + Math.cos(angle) * 0.015;
        const offsetY = y + Math.sin(angle) * 0.015;

        this.engine.splatVelocity(
          [offsetX, offsetY],
          [velX, velY],
          lobeRadius * 1.3,
          aspect
        );
        this.engine.splatDye([offsetX, offsetY], dyeRgb, lobeRadius, aspect);
      }
    }
  }

  /**
   * Computes emitter position (x, y) and central aim angle based on movementMode.
   */
  private computeEmitterTransform(
    index: number,
    total: number,
    time: number,
    midEnergy: number,
    cfg: ChoreographyConfig["emitters"]
  ): [number, number, number] {
    const baseAngle = (index * 2 * Math.PI) / total;
    const t = time * cfg.driftSpeed;

    if (cfg.movementMode === "stationary") {
      const x = 0.5 + Math.cos(baseAngle) * cfg.anchorRadius;
      const y = 0.5 + Math.sin(baseAngle) * cfg.anchorRadius;
      return [x, y, baseAngle + Math.PI];
    }

    if (cfg.movementMode === "orbit") {
      const orbitAngle = baseAngle + t;
      const x = 0.5 + Math.cos(orbitAngle) * cfg.anchorRadius;
      const y = 0.5 + Math.sin(orbitAngle) * cfg.anchorRadius;
      return [x, y, orbitAngle + Math.PI * 0.75];
    }

    // Default 'drift': organic slow Perlin-like wandering around anchor zone
    const wanderX =
      Math.sin(t * 1.1 + index * 2.3) * 0.08 +
      Math.cos(t * 0.7 - index * 1.7) * 0.05;
    const wanderY =
      Math.cos(t * 0.9 + index * 3.1) * 0.08 +
      Math.sin(t * 1.3 + index * 1.1) * 0.05;

    const x = 0.5 + Math.cos(baseAngle) * cfg.anchorRadius + wanderX;
    const y = 0.5 + Math.sin(baseAngle) * cfg.anchorRadius + wanderY;

    // Gently breathe aim direction with midrange frequencies
    const aimAngle =
      baseAngle + Math.PI + Math.sin(t * 1.5 + index) * (0.6 + midEnergy * 0.5);

    return [x, y, aimAngle];
  }

  // --------------------------------------------------------------------------
  // Module 3: Omnidirectional / Configurable Bass Pulse
  // --------------------------------------------------------------------------

  private emitRhythmicPulse(
    ctx: FrameContext,
    cfg: ChoreographyConfig["pulse"]
  ) {
    const { dsp, smoothedArousal, aspect, animTime } = ctx;
    if (dsp.bassImpulse < cfg.bassThreshold) return;

    // Scale kick strength by arousal so soft acoustic kicks don't violently jar the screen
    const pulseSpeed =
      dsp.bassImpulse * cfg.speedMultiplier * (0.4 + smoothedArousal * 0.8);
    const spreadRad = (cfg.spreadDeg * Math.PI) / 180;
    const baseAngle = animTime * 0.9;

    for (let l = 0; l < cfg.lobes; l++) {
      const angle =
        cfg.spreadDeg >= 360
          ? baseAngle + (l * 2 * Math.PI) / cfg.lobes
          : baseAngle + (l / Math.max(1, cfg.lobes - 1) - 0.5) * spreadRad;

      const px = 0.5 + Math.cos(angle) * 0.04;
      const py = 0.5 + Math.sin(angle) * 0.04;

      // Tangential + outward billow
      const vx = Math.cos(angle + 0.4) * pulseSpeed;
      const vy = Math.sin(angle + 0.4) * pulseSpeed;

      this.engine.splatVelocity([px, py], [vx, vy], cfg.radius, aspect);
    }
  }

  // --------------------------------------------------------------------------
  // Module 4: Arousal-Driven Fluid Thermodynamics
  // --------------------------------------------------------------------------

  private stepPhysics(ctx: FrameContext, cfg: ChoreographyConfig["physics"]) {
    const { simDt, animTime, dsp, smoothedArousal, isPlaying, style } = ctx;

    // 1. Vorticity (Laminar when arousal is low, turbulent when arousal/flux is high)
    const baseVorticity =
      cfg.minVorticity +
      smoothedArousal * (cfg.maxVorticity - cfg.minVorticity);
    const fluxBoost = isPlaying
      ? dsp.spectralFlux * cfg.spectralFluxVorticityWeight
      : 0;
    const totalVorticity =
      (baseVorticity + fluxBoost) * style.vorticityMultiplier;

    // 2. Dye Lingering (Calm arousal increases dissipation toward 0.997 so smoke hangs longer)
    const calmFactor = 1.0 - smoothedArousal;
    const dynamicDyeDissipation = Math.min(
      0.997,
      style.dyeDissipation + calmFactor * cfg.calmLingeringBoost
    );

    // 3. Velocity Damping (Calm arousal dampens momentum faster so jets don't coast forever)
    const dynamicViscosity = Math.max(
      0.92,
      style.viscosity - calmFactor * cfg.calmViscosityDamping
    );

    this.engine.step(
      simDt,
      animTime,
      totalVorticity,
      dynamicViscosity,
      dynamicDyeDissipation
    );
  }

  // --------------------------------------------------------------------------
  // Module 5: Particle Advection & Rendering
  // --------------------------------------------------------------------------

  private stepParticles(ctx: FrameContext) {
    const { simDt, animTime } = ctx;
    const emitterCenter: [number, number] = [
      0.5 + Math.cos(animTime * 0.25) * 0.1,
      0.5 + Math.sin(animTime * 0.25) * 0.1,
    ];
    this.engine.updateParticles(simDt, animTime, emitterCenter);
  }

  private renderFrame(ctx: FrameContext, cfg: ChoreographyConfig["particles"]) {
    const { dsp, smoothedArousal, style } = ctx;
    const treble = dsp.trebleEnergy ?? 0;

    const arousalDensity =
      cfg.minArousalDensity +
      smoothedArousal * (cfg.maxArousalDensity - cfg.minArousalDensity);
    const dpr = Math.min(window.devicePixelRatio || 1, this.perfConfig.maxDpr);

    const pointSize =
      cfg.basePointSize * dpr * (1.0 + treble * cfg.trebleSizeBoost);
    const particleAlpha =
      style.particleDensity *
      arousalDensity *
      (0.3 + treble * cfg.trebleAlphaBoost);

    this.engine.render(style.edgeSharpness, particleAlpha, treble, pointSize);
  }

  // --------------------------------------------------------------------------
  // Initial Ambient Cloud Seed
  // --------------------------------------------------------------------------

  private seedInitialPlume(ctx: FrameContext) {
    const colA = ctx.colors[0]?.rgb ?? [0.06, 0.72, 0.5];
    const colB = ctx.colors[1]?.rgb ?? colA;

    // Seed a soft 360-degree ambient cloud in the center instead of hard directional jets
    const lobes = 6;
    for (let step = 0; step < 8; step++) {
      for (let l = 0; l < lobes; l++) {
        const angle = (l * 2 * Math.PI) / lobes + step * 0.2;
        const x = 0.5 + Math.cos(angle) * 0.08;
        const y = 0.5 + Math.sin(angle) * 0.08;
        const col = l % 2 === 0 ? colA : colB;

        this.engine.splatVelocity(
          [x, y],
          [Math.cos(angle + 0.5) * 45, Math.sin(angle + 0.5) * 45],
          0.003,
          ctx.aspect
        );
        this.engine.splatDye(
          [x, y],
          [col[0] * 0.12, col[1] * 0.12, col[2] * 0.12],
          0.0028,
          ctx.aspect
        );
      }
      this.engine.step(
        0.016,
        step * 0.1,
        8.0,
        this.styleParams.viscosity,
        this.styleParams.dyeDissipation
      );
    }
  }
}
