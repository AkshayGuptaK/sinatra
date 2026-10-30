import {
  FLUID_PRESETS,
  type FluidStyle,
  type FluidStyleParams,
  VISUALIZER_TRANSFER_MAP,
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

export class FluidVisualizer {
  private engine: FluidSimulationEngine;
  private styleParams: FluidStyleParams;

  // Aesthetic State
  private currentColors: { rgb: [number, number, number]; weight: number }[] =
    [];
  private currentArousal = 0.35;
  private lastTime = performance.now();
  private animTime = 0;
  private latestTreble = 0;
  private hasSeededInitialPlume = false;

  constructor(canvas: HTMLCanvasElement, stylePreset: FluidStyle = "smoke") {
    this.engine = new FluidSimulationEngine(canvas);
    this.styleParams = FLUID_PRESETS[stylePreset] ?? FLUID_PRESETS.smoke;
  }

  public setStylePreset(preset: FluidStyle) {
    if (FLUID_PRESETS[preset]) {
      this.styleParams = FLUID_PRESETS[preset];
    }
  }

  public resize() {
    this.engine.resize();
  }

  public destroy() {
    this.engine.destroy();
  }

  // --------------------------------------------------------------------------
  // High-Level Animation Loop
  // --------------------------------------------------------------------------

  public update(args: FluidUpdateArgs) {
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.025);
    this.lastTime = now;

    const { dsp, rms, profile, isPlaying } = args;
    this.latestTreble = dsp.trebleEnergy ?? 0;

    // 1. Smoothly interpolate segment colors & arousal (exponential ease)
    const lerpFactor = 1.0 - Math.exp(-dt / 0.65);
    this.currentArousal +=
      (profile.arousalScore - this.currentArousal) * lerpFactor;

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
            (target.rgb[0] - this.currentColors[i].rgb[0]) * lerpFactor;
          this.currentColors[i].rgb[1] +=
            (target.rgb[1] - this.currentColors[i].rgb[1]) * lerpFactor;
          this.currentColors[i].rgb[2] +=
            (target.rgb[2] - this.currentColors[i].rgb[2]) * lerpFactor;
          this.currentColors[i].weight +=
            (target.weight - this.currentColors[i].weight) * lerpFactor;
        }
      }
      if (this.currentColors.length > profile.colors.length) {
        this.currentColors.length = profile.colors.length;
      }
    }

    const aspect = this.engine.getAspect();

    // Seed initial swirl on open
    if (!this.hasSeededInitialPlume && this.currentColors.length > 0) {
      this.seedInitialPlume(aspect);
      this.hasSeededInitialPlume = true;
    }

    const simDt = isPlaying ? dt : dt * 0.12;
    this.animTime += simDt * (0.7 + this.currentArousal * 0.8);

    // 2. Inject audio forces into the fluid
    if (isPlaying) {
      this.injectAudioJets(dsp, Math.max(0.12, rms), aspect);
    }

    // 3. Step Navier-Stokes physics
    const fluxBoost = VISUALIZER_TRANSFER_MAP.fluxToVorticity(
      isPlaying ? dsp.spectralFlux : 0
    );
    const totalVorticity =
      (12.0 + this.currentArousal * 26.0 + fluxBoost) *
      this.styleParams.vorticityMultiplier;

    this.engine.step(
      simDt,
      this.animTime,
      totalVorticity,
      this.styleParams.viscosity,
      this.styleParams.dyeDissipation
    );

    // 4. Update dust particles
    const emitterCenter: [number, number] = [
      0.5 + Math.cos(this.animTime * 0.5) * 0.12,
      0.5 + Math.sin(this.animTime * 0.5) * 0.12,
    ];
    this.engine.updateParticles(simDt, this.animTime, emitterCenter);
  }

  public draw(trebleOverride?: number) {
    const trebleEnergy = trebleOverride ?? this.latestTreble;
    const effectiveDensity =
      this.styleParams.particleDensity * (0.25 + this.currentArousal * 0.75);

    const sparkle = VISUALIZER_TRANSFER_MAP.trebleToSparkle(trebleEnergy);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pointSize = 2.0 * dpr * sparkle.sizeMultiplier;
    const particleAlpha = effectiveDensity * sparkle.alphaMultiplier;

    this.engine.render(
      this.styleParams.edgeSharpness,
      particleAlpha,
      trebleEnergy,
      pointSize
    );
  }

  // --------------------------------------------------------------------------
  // Visual Choreography (Tweakable Jet & Plume Logic)
  // --------------------------------------------------------------------------

  private injectAudioJets(
    dsp: DspVisualizerMetrics,
    rms: number,
    aspect: number
  ) {
    const palette =
      this.currentColors.length > 0
        ? this.currentColors
        : [{ rgb: [0.06, 0.72, 0.5] as [number, number, number], weight: 1.0 }];

    // Guarantee counter-flowing streams for single-emotion segments
    const jets =
      palette.length === 1
        ? [
            { rgb: palette[0].rgb, weight: 0.55 },
            {
              rgb: [
                Math.min(1, palette[0].rgb[0] * 1.25 + 0.08),
                Math.min(1, palette[0].rgb[1] * 0.9 + 0.05),
                Math.min(1, palette[0].rgb[2] * 1.2 + 0.1),
              ] as [number, number, number],
              weight: 0.45,
            },
          ]
        : palette;

    const numJets = jets.length;
    const bassKick = VISUALIZER_TRANSFER_MAP.bassToImpulse(dsp.bassImpulse);
    const midEnergy =
      ((dsp.bands[2] ?? 0) + (dsp.bands[3] ?? 0) + (dsp.bands[4] ?? 0)) / 3;

    // Plume filament thickness (sigma^2 in UV space)
    const baseSigmaSq = 0.0011 + rms * 0.0018;

    for (let i = 0; i < numJets; i++) {
      const jet = jets[i];
      const baseAngle = (i * 2.0 * Math.PI) / numJets + this.animTime * 0.38;

      // Lissajous orbital trajectory
      const orbitR = 0.24 + 0.08 * Math.sin(this.animTime * 0.7 + i * 2.1);
      const x = 0.5 + Math.cos(baseAngle) * orbitR;
      const y = 0.5 + Math.sin(baseAngle * 1.3 + i) * orbitR;

      // Aim jet across the center with tangential curl + mid-frequency oscillation
      const toCenterX = 0.5 - x;
      const toCenterY = 0.5 - y;
      const tangentX = -toCenterY;
      const tangentY = toCenterX;

      const waveAngle =
        Math.sin(this.animTime * 2.4 + i * 1.7) * (0.55 + midEnergy * 0.9);
      const dirX =
        toCenterX * Math.cos(waveAngle) + tangentX * Math.sin(waveAngle);
      const dirY =
        toCenterY * Math.cos(waveAngle) + tangentY * Math.sin(waveAngle);
      const dirLen = Math.hypot(dirX, dirY) || 1.0;

      // Velocity magnitude in simulation grid units
      const speed =
        (160.0 + rms * 260.0 + bassKick * 12.0) * (0.65 + jet.weight * 0.7);
      const velX = (dirX / dirLen) * speed;
      const velY = (dirY / dirLen) * speed;
      const jetRadius = baseSigmaSq * (0.7 + jet.weight * 0.6);

      // Splat velocity and dye
      this.engine.splatVelocity([x, y], [velX, velY], jetRadius * 1.4, aspect);

      const intensity =
        (0.14 + rms * 0.24 + dsp.bassImpulse * 0.28) * (0.5 + jet.weight * 0.8);
      const dyeRgb: [number, number, number] = [
        jet.rgb[0] * intensity,
        jet.rgb[1] * intensity,
        jet.rgb[2] * intensity,
      ];
      this.engine.splatDye([x, y], dyeRgb, jetRadius, aspect);
    }

    // Central shear vortex burst on strong bass kicks
    if (dsp.bassImpulse > 0.18) {
      const kickAngle = this.animTime * 3.1;
      const kickSpeed = dsp.bassImpulse * 420.0;
      const cx = 0.5 + Math.cos(kickAngle) * 0.06;
      const cy = 0.5 + Math.sin(kickAngle) * 0.06;

      this.engine.splatVelocity(
        [cx, cy],
        [-Math.sin(kickAngle) * kickSpeed, Math.cos(kickAngle) * kickSpeed],
        0.0035,
        aspect
      );
    }
  }

  private seedInitialPlume(aspect: number) {
    const colA = this.currentColors[0]?.rgb ?? [0.96, 0.62, 0.04];
    const colB = this.currentColors[1]?.rgb ?? [0.66, 0.33, 0.97];

    for (let step = 0; step < 12; step++) {
      const t = step / 12;
      const angle = t * Math.PI * 2;
      const x1 = 0.32 + Math.cos(angle) * 0.12;
      const y1 = 0.45 + Math.sin(angle) * 0.12;
      const x2 = 0.68 - Math.cos(angle) * 0.12;
      const y2 = 0.55 - Math.sin(angle) * 0.12;

      this.engine.splatVelocity([x1, y1], [280, 120], 0.0025, aspect);
      this.engine.splatDye(
        [x1, y1],
        [colA[0] * 0.35, colA[1] * 0.35, colA[2] * 0.35],
        0.002,
        aspect
      );

      this.engine.splatVelocity([x2, y2], [-280, -120], 0.0025, aspect);
      this.engine.splatDye(
        [x2, y2],
        [colB[0] * 0.35, colB[1] * 0.35, colB[2] * 0.35],
        0.002,
        aspect
      );

      this.engine.step(
        0.016,
        0,
        15.0,
        this.styleParams.viscosity,
        this.styleParams.dyeDissipation
      );
    }
  }
}
