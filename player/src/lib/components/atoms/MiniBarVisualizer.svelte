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

  let currentHeights = $state<number[]>([]);
  let peaks = $state<{ height: number; speed: number; holdFrames: number }[]>(
    []
  );

  $effect(() => {
    currentHeights = new Array(bars).fill(0);
    peaks = Array.from({ length: bars }, () => ({
      height: 0,
      speed: 0,
      holdFrames: 0,
    }));
  });

  const GRAVITY = 0.01; // Downward acceleration
  const PEAK_HOLD = 20; // Frames to hover before dropping
  const DECAY_RATE = 0.97; // Lower = drops faster

  function draw() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvasEl.width;
    const h = canvasEl.height;

    ctx.clearRect(0, 0, w, h);

    const style = getComputedStyle(canvasEl);
    const barColor = style.getPropertyValue("--primary").trim() || "#38bdf8";
    const peakColor = style.getPropertyValue("--ring").trim() || barColor;

    const gap = 1 * dpr;
    const barWidth = (w - gap * (bars - 1)) / bars;
    const capHeight = 1.5 * dpr;
    const minHeight = 2 * dpr;

    const bands = isPlaying ? player.engine.getFrequencyBands(bars) : [];
    let hasActiveMotion = false;

    for (let i = 0; i < bars; i++) {
      let targetHeight: number;

      if (isPlaying) {
        const target = bands[i] ?? 0;
        targetHeight = Math.max(minHeight, target * (h - capHeight));
        currentHeights[i] = targetHeight;
        hasActiveMotion = true;
      } else {
        currentHeights[i] = Math.max(
          minHeight,
          (currentHeights[i] ?? minHeight) * DECAY_RATE
        );
        targetHeight = currentHeights[i];

        // Check if bar is still falling toward baseline
        if (currentHeights[i] > minHeight + 0.1) {
          hasActiveMotion = true;
        }
      }

      const x = i * (barWidth + gap);
      const y = h - targetHeight;

      // 1. Draw animated frequency bar
      ctx.fillStyle = barColor;
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, targetHeight, 1 * dpr);
      ctx.fill();

      // 2. Ballistic Gravity Peak Hold
      const peak = peaks[i];
      if (targetHeight >= peak.height) {
        peak.height = targetHeight;
        peak.speed = 0;
        peak.holdFrames = PEAK_HOLD;
      } else {
        if (peak.holdFrames > 0) {
          peak.holdFrames--;
          hasActiveMotion = true;
        } else {
          peak.speed += GRAVITY * dpr;
          peak.height = Math.max(0, peak.height - peak.speed);

          if (peak.height > minHeight) {
            hasActiveMotion = true;
          }
        }
      }

      // 3. Draw Peak Cap
      if (peak.height > 2 * dpr) {
        const capY = h - peak.height - capHeight;
        ctx.fillStyle = peakColor;
        ctx.fillRect(x, Math.max(0, capY), barWidth, capHeight);
      }
    }

    if (isPlaying || hasActiveMotion) {
      animId = requestAnimationFrame(draw);
    } else {
      animId = null;
    }
  }

  $effect(() => {
    // Start or keep loop alive whenever playing, or when toggling off so it can decay
    if (isPlaying) {
      if (!animId) animId = requestAnimationFrame(draw);
    } else {
      if (!animId) animId = requestAnimationFrame(draw);
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
