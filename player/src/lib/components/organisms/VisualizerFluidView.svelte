<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { TrackSegment } from "$lib/types/track";
  import type { DspVisualizerMetrics } from "$lib/core/dsp.svelte";
  import type {
    FluidStyle,
    VisualizerQualityPreset,
  } from "$lib/config/visualizer";
  import { FluidVisualizer } from "$lib/utils/fluidWebGL";
  import { extractSegmentProfile } from "$lib/utils/visualizerPalette";

  interface Props {
    segments: TrackSegment[];
    duration: number;
    currentTime: number;
    isPlaying: boolean;
    rms?: number[];
    stylePreset?: FluidStyle;
    qualityPreset?: VisualizerQualityPreset;
    getDspMetrics: () => DspVisualizerMetrics;
    class?: string;
  }

  let {
    segments = [],
    duration = 0,
    currentTime = 0,
    isPlaying = false,
    rms = [],
    stylePreset = "smoke",
    qualityPreset = "balanced",
    getDspMetrics,
    class: className = "",
  }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let renderer: FluidVisualizer | null = null;
  let animId: number | null = null;
  let lastFrameTime = 0;

  // Reactively sync preset changes without recreating the WebGL context
  $effect(() => {
    renderer?.setStylePreset(stylePreset);
  });

  $effect(() => {
    renderer?.setQualityPreset(qualityPreset);
  });

  // Active segment profile reactively derived from currentTime
  let activeProfile = $derived.by(() => {
    if (!segments.length || duration <= 0) return extractSegmentProfile(null);
    const seg =
      segments.find(
        (s) => currentTime >= s.start_sec && currentTime < s.end_sec
      ) ?? segments[0];
    return extractSegmentProfile(seg?.acoustic_emotions);
  });

  // Normalized RMS level at current playhead
  let currentRms = $derived.by(() => {
    if (!rms || rms.length === 0 || duration <= 0) return 0.2;
    const idx = Math.min(
      rms.length - 1,
      Math.floor((currentTime / duration) * rms.length)
    );
    return rms[idx] ?? 0.2;
  });

  function renderLoop(now: number) {
    animId = requestAnimationFrame(renderLoop);
    if (!renderer) return;

    const targetFps = renderer.getTargetFps();
    if (targetFps > 0) {
      const frameInterval = 1000 / targetFps;
      const elapsed = now - lastFrameTime;

      // 1ms tolerance prevents 60Hz monitor refresh jitter from skipping frames
      if (elapsed < frameInterval - 1.0) {
        return;
      }
      lastFrameTime = now - (elapsed % frameInterval);
    } else {
      lastFrameTime = now;
    }

    const dsp = getDspMetrics();
    renderer.update({
      dsp,
      rms: currentRms,
      profile: activeProfile,
      isPlaying,
    });
    renderer.draw();
  }

  onMount(() => {
    if (canvasEl) {
      renderer = new FluidVisualizer(canvasEl, stylePreset, qualityPreset);
      lastFrameTime = performance.now();
      animId = requestAnimationFrame(renderLoop);
    }
  });

  onDestroy(() => {
    if (animId) cancelAnimationFrame(animId);
    renderer?.destroy();
  });
</script>

<canvas
  bind:this={canvasEl}
  class="w-full h-full block bg-[#07080c] select-none {className}"
></canvas>
