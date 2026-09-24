<script lang="ts">
  import { onMount } from "svelte";
  import { player } from "$lib/audio/player.svelte";
  import { cn } from "$lib/utils";

  interface Props {
    isPlaying?: boolean;
    bars?: number;
    class?: string;
  }

  let { isPlaying = false, bars = 4, class: className = "" }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let animId: number | null = null;

  // Ballistic gravity state for peak caps
  let peaks = $state<{ height: number; speed: number; holdFrames: number }[]>(
    []
  );

  $effect(() => {
    peaks = Array.from({ length: bars }, () => ({
      height: 0,
      speed: 0,
      holdFrames: 0,
    }));
  });

  const GRAVITY = 0.01; // Downward acceleration
  const PEAK_HOLD = 20; // Frames to hover before dropping

  function draw() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasEl.width;
    const h = canvasEl.height;

    ctx.clearRect(0, 0, w, h);

    // Resolve CSS colors directly from the active skin
    const style = getComputedStyle(canvasEl);
    const barColor = style.getPropertyValue("--primary").trim() || "#38bdf8";
    const peakColor = style.getPropertyValue("--ring").trim() || barColor;

    // Get normalized frequency levels [0.0 - 1.0]
    const bands = isPlaying
      ? player.engine.getFrequencyBands(bars)
      : new Array(bars).fill(0);

    const gap = 1 * dpr;
    const barWidth = (w - gap * (bars - 1)) / bars;
    const capHeight = 1.5 * dpr;

    for (let i = 0; i < bars; i++) {
      const target = bands[i];
      const currentBarHeight = Math.max(2 * dpr, target * (h - capHeight));
      const x = i * (barWidth + gap);
      const y = h - currentBarHeight;

      // 1. Draw animated frequency bar
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, currentBarHeight, 1 * dpr);
      ctx.fill();

      // 2. Ballistic Gravity Peak Hold
      const peak = peaks[i];
      if (currentBarHeight >= peak.height) {
        peak.height = currentBarHeight;
        peak.speed = 0;
        peak.holdFrames = PEAK_HOLD;
      } else {
        if (peak.holdFrames > 0) {
          peak.holdFrames--;
        } else {
          peak.speed += GRAVITY * dpr;
          peak.height = Math.max(0, peak.height - peak.speed);
        }
      }

      // 3. Draw Peak Cap
      if (peak.height > 2 * dpr) {
        const capY = h - peak.height - capHeight;
        ctx.fillStyle = peakColor;
        ctx.fillRect(x, Math.max(0, capY), barWidth, capHeight);
      }
    }

    if (isPlaying) {
      animId = requestAnimationFrame(draw);
    }
  }

  $effect(() => {
    if (isPlaying) {
      if (!animId) animId = requestAnimationFrame(draw);
    } else {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      draw();
    }
  });

  onMount(() => {
    if (canvasEl) {
      const dpr = window.devicePixelRatio || 1;
      canvasEl.width = 18 * dpr;
      canvasEl.height = 14 * dpr;
      draw();
    }
    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  });
</script>

<canvas
  bind:this={canvasEl}
  class={cn("w-[48px] h-[24px] shrink-0 inline-block", className)}
></canvas>
