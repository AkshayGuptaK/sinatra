<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import type { TrackSegment } from "$lib/types/track";
  import type { DspVisualizerMetrics } from "$lib/core/dsp.svelte";
  import type { FluidStyle } from "$lib/config/visualizer";
  import { FluidVisualizer } from "$lib/utils/fluidWebGL";
  import { extractSegmentProfile } from "$lib/utils/visualizerPalette";

  interface Props {
    segments: TrackSegment[];
    duration: number;
    currentTime: number;
    isPlaying: boolean;
    rms?: number[];
    stylePreset?: FluidStyle;
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
    getDspMetrics,
    class: className = "",
  }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let renderer: FluidVisualizer | null = null;
  let animId: number | null = null;

  // Active segment profile reactively derived from currentTime
  let activeProfile = $derived.by(() => {
    if (!segments.length || duration <= 0) return extractSegmentProfile(null);
    const seg =
      segments.find(
        (s) => currentTime >= s.start_sec && currentTime <= s.end_sec
      ) ?? segments[0];
    return extractSegmentProfile(seg?.emotions_normalized);
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

  function renderLoop() {
    if (renderer) {
      const dsp = getDspMetrics();
      renderer.update({
        dsp,
        rms: currentRms,
        profile: activeProfile,
        isPlaying,
      });
      renderer.draw();
    }
    animId = requestAnimationFrame(renderLoop);
  }

  onMount(() => {
    if (canvasEl) {
      renderer = new FluidVisualizer(canvasEl, stylePreset);
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
