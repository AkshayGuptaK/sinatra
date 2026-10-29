<script lang="ts">
  import type { TrackSegment } from "$lib/types/track";
  import { cn } from "$lib/utils";
  import { formatTime } from "$lib/utils/time";
  import { COWEN_EMOTION_COLORS } from "$lib/constants/emotions";
  import { sortEmotions } from "$lib/core/emotions.svelte";
  import EmotionLegend from "$lib/components/molecules/EmotionLegend.svelte";
  import EmotionsDisplay from "$lib/components/molecules/EmotionsDisplay.svelte";

  const EMOTION_THRESHOLD = 0.3;
  const INSPECTOR_THRESHOLD_PCT = 30;
  const BAR_HEIGHT = 5;
  const BAR_STACK_GAP = 1.5;

  interface Props {
    segments: TrackSegment[];
    duration: number;
    currentTime: number;
    isPlaying?: boolean;
    rms?: number[];
    emotions?: Record<string, number> | null;
    onSeek?: (seconds: number) => void;
    class?: string;
  }

  let {
    segments = [],
    duration = 0,
    currentTime = 0,
    isPlaying = false,
    rms = [],
    emotions = {},
    onSeek,
    class: className = "",
  }: Props = $props();

  let containerEl = $state<HTMLDivElement | null>(null);
  let hoveredSegmentIndex = $state<number | null>(null);
  let hoveredEmotion = $state<{
    name: string;
    score: number;
    x: number;
    y: number;
  } | null>(null);

  //Fallback track duration to prevent divide-by-zero
  const trackDuration = $derived(
    duration > 0
      ? duration
      : segments.length > 0
        ? segments[segments.length - 1].end_sec
        : 1
  );

  // --- Smooth 60fps Playhead Interpolation ---
  let smoothTime = $state(0);
  let lastSyncTime = 0;
  let lastSyncPerf = 0;

  $effect(() => {
    // Sync anchor whenever currentTime prop updates from audio engine
    lastSyncTime = currentTime;
    lastSyncPerf = performance.now();
    smoothTime = currentTime;
  });

  $effect(() => {
    if (!isPlaying) {
      smoothTime = currentTime;
      return;
    }

    let rafId: number;
    const tick = (now: number) => {
      const elapsedSec = (now - lastSyncPerf) / 1000;
      smoothTime = Math.min(trackDuration, lastSyncTime + elapsedSec);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  });

  const playheadX = $derived(
    Math.min(1000, Math.max(0, (smoothTime / trackDuration) * 1000))
  );

  // Active playing segment index based on clock
  const activePlayingSegmentIndex = $derived(
    segments.findIndex(
      (s) => currentTime >= s.start_sec && currentTime < s.end_sec
    )
  );

  // Target segment to display in the inspector dock: hovered overrides playing
  const displayedSegmentIndex = $derived(
    hoveredSegmentIndex !== null
      ? hoveredSegmentIndex
      : activePlayingSegmentIndex !== -1
        ? activePlayingSegmentIndex
        : 0
  );

  const displayedSegment = $derived(segments[displayedSegmentIndex] ?? null);

  // Extract and format emotions for EmotionsDisplay
  const inspectorSortedEmotions = $derived.by(() => {
    if (!displayedSegment?.emotions_normalized) return [];
    return Object.entries(displayedSegment.emotions_normalized)
      .map(([name, score]) => ({
        name,
        pct: Math.round(score * 100),
      }))
      .filter((e) => e.pct >= INSPECTOR_THRESHOLD_PCT)
      .sort((a, b) => b.pct - a.pct);
  });

  const sortedEmotions = $derived.by(() => {
    return sortEmotions(emotions);
  });

  /**
   * Computes non-overlapping Y coordinates for a segment's emotion bars.
   * Emotions sharing the exact same rounded percentage are stacked vertically.
   */
  function getStackedSegmentEmotions(seg: TrackSegment) {
    const countsByPct = new Map<number, number>();

    return Object.entries(seg.emotions_normalized)
      .filter(
        ([emotion, score]) =>
          score >= EMOTION_THRESHOLD && Boolean(COWEN_EMOTION_COLORS[emotion])
      )
      .sort((a, b) => a[0].localeCompare(b[0])) // Deterministic stacking order
      .map(([emotion, score]) => {
        const pct = Math.round(score * 100);
        const stackIdx = countsByPct.get(pct) ?? 0;
        countsByPct.set(pct, stackIdx + 1);

        const baseY = 280 - (pct / 100) * 260;
        const y = baseY - stackIdx * (BAR_HEIGHT + BAR_STACK_GAP);

        return {
          emotion,
          pct,
          y,
          color: COWEN_EMOTION_COLORS[emotion],
        };
      });
  }

  function handleTimelineClick(event: MouseEvent) {
    if (!containerEl || trackDuration <= 0) return;
    const rect = containerEl.getBoundingClientRect();
    const clickRatio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width)
    );
    const targetSec = clickRatio * trackDuration;
    smoothTime = targetSec;
    onSeek?.(targetSec);
  }

  // Closed polygon path for the gradient fill
  const rmsFillPath = $derived.by(() => {
    if (!rms || rms.length === 0) return "";

    const baselineY = 280;
    const maxAmplitude = 230;
    const n = rms.length;
    const stepX = 1000 / (n - 1 || 1);

    const points: string[] = [`M 0 ${baselineY}`];

    for (let i = 0; i < n; i++) {
      const x = (i * stepX).toFixed(1);
      const val = Math.max(0, Math.min(1, rms[i] ?? 0));
      const y = (baselineY - val * maxAmplitude).toFixed(1);
      points.push(`L ${x} ${y}`);
    }

    points.push(`L 1000 ${baselineY} Z`);
    return points.join(" ");
  });

  // Crisp line path tracking only the top crest of the volume curve
  const rmsStrokePath = $derived.by(() => {
    if (!rms || rms.length === 0) return "";

    const baselineY = 280;
    const maxAmplitude = 230;
    const n = rms.length;
    const stepX = 1000 / (n - 1 || 1);

    return rms
      .map((val, i) => {
        const command = i === 0 ? "M" : "L";
        const x = (i * stepX).toFixed(1);
        const clamped = Math.max(0, Math.min(1, val ?? 0));
        const y = (baselineY - clamped * maxAmplitude).toFixed(1);
        return `${command} ${x} ${y}`;
      })
      .join(" ");
  });
</script>

<div
  class={cn(
    "flex flex-col gap-4 w-full rounded-xl border-t border-border/60",
    className
  )}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={containerEl}
    onclick={handleTimelineClick}
    onpointerleave={() => {
      hoveredSegmentIndex = null;
      hoveredEmotion = null;
    }}
    class="relative w-full h-72 bg-card/40 backdrop-blur-sm p-4 overflow-hidden select-none cursor-pointer"
  >
    <!-- Background Grid Lines -->
    <div
      class="absolute inset-x-4 inset-y-4 pointer-events-none flex flex-col justify-between opacity-20 border-b border-border"
    >
      <div
        class="w-full border-t border-border flex justify-between text-[10px] text-muted-foreground"
      >
        <span>100%</span>
      </div>
      <div
        class="w-full border-t border-border flex justify-between text-[10px] text-muted-foreground"
      >
        <span>50%</span>
      </div>
      <div class="w-full border-t border-border"></div>
    </div>

    <svg
      viewBox="0 0 1000 300"
      preserveAspectRatio="none"
      class="w-full h-full overflow-visible"
    >
      <defs>
        <linearGradient id="rms-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop
            offset="0%"
            stop-color="var(--muted-foreground)"
            stop-opacity="0.25"
          />
          <stop
            offset="80%"
            stop-color="var(--muted-foreground)"
            stop-opacity="0.05"
          />
          <stop
            offset="100%"
            stop-color="var(--muted-foreground)"
            stop-opacity="0.0"
          />
        </linearGradient>

        <filter id="bar-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>

        <filter
          id="bar-hover-glow"
          x="-50%"
          y="-60%"
          width="200%"
          height="220%"
        >
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <!-- 1. Background RMS Volume Layer -->
      {#if rmsFillPath}
        <path
          d={rmsFillPath}
          fill="url(#rms-gradient)"
          class="transition-all duration-300 pointer-events-none"
        />
        <path
          d={rmsStrokePath}
          fill="none"
          stroke="var(--muted-foreground)"
          stroke-width="1.5"
          stroke-opacity="0.35"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="transition-all duration-300 pointer-events-none"
        />
      {/if}

      <!-- 2. Segment Columns & Stacked Emotion Horizontal Bars -->
      {#each segments as seg, idx}
        {@const segStartX = (seg.start_sec / trackDuration) * 1000}
        {@const segWidth = Math.max(
          2,
          ((seg.end_sec - seg.start_sec) / trackDuration) * 1000
        )}
        {@const isCurrentSegment = activePlayingSegmentIndex === idx}
        {@const isHoveredSegment = hoveredSegmentIndex === idx}
        {@const stackedBars = getStackedSegmentEmotions(seg)}

        <g
          class={cn(
            "transition-opacity duration-150",
            isCurrentSegment || isHoveredSegment ? "opacity-100" : "opacity-35"
          )}
          onpointerenter={() => (hoveredSegmentIndex = idx)}
        >
          <!-- Full-height hit-test & hover highlight column for the segment -->
          <rect
            x={segStartX}
            y="0"
            width={segWidth}
            height="300"
            fill="var(--foreground)"
            fill-opacity={isHoveredSegment ? "0.04" : "0"}
            class="transition-opacity duration-150"
          />

          {#each stackedBars as bar (bar.emotion)}
            <rect
              x={segStartX + 1}
              y={bar.y}
              width={Math.max(1, segWidth - 2)}
              height={BAR_HEIGHT}
              rx="2.5"
              fill={bar.color}
              filter={isCurrentSegment || isHoveredSegment
                ? "url(#bar-glow)"
                : undefined}
              class="cursor-pointer transition-all duration-150 hover:brightness-135 hover:[filter:url(#bar-hover-glow)]"
              onpointerenter={(e) => {
                hoveredEmotion = {
                  name: bar.emotion,
                  score: bar.pct,
                  x: e.clientX,
                  y: e.clientY,
                };
              }}
              onpointermove={(e) => {
                if (hoveredEmotion) {
                  hoveredEmotion.x = e.clientX;
                  hoveredEmotion.y = e.clientY;
                }
              }}
              onpointerleave={() => (hoveredEmotion = null)}
            />
          {/each}
        </g>
      {/each}

      <!-- 3. Current Playhead Vertical Line (60fps Smooth Glide) -->
      <line
        x1={playheadX.toFixed(2)}
        y1="0"
        x2={playheadX.toFixed(2)}
        y2="300"
        stroke="var(--foreground)"
        stroke-width="2"
        stroke-opacity="0.9"
        class="pointer-events-none"
      />
    </svg>

    <!-- Emotion Bar Hover Tooltip -->
    {#if hoveredEmotion}
      <div
        class="fixed z-50 pointer-events-none rounded-md border bg-popover/90 px-2.5 py-1 text-xs font-medium text-popover-foreground shadow-md backdrop-blur-md -translate-x-1/2 -translate-y-full -mt-2"
        style="left: {hoveredEmotion.x}px; top: {hoveredEmotion.y}px;"
      >
        <div class="flex items-center gap-1.5">
          <span
            class="size-2 rounded-full inline-block"
            style="background-color: {COWEN_EMOTION_COLORS[
              hoveredEmotion.name
            ] || 'var(--primary)'}"
          ></span>
          <span class="capitalize">{hoveredEmotion.name}</span>
          <span class="font-mono text-muted-foreground"
            >{hoveredEmotion.score}%</span
          >
        </div>
      </div>
    {/if}
  </div>

  <!-- Bottom: Segment Inspector Dock -->
  {#if displayedSegment}
    <div class="w-full bg-card/30 p-4 backdrop-blur-xs flex flex-col gap-3">
      <div class="flex gap-2">
        <div class="flex-1">
          <div class="flex justify-between">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-[14px] text-foreground">
                Segment {displayedSegmentIndex + 1}
              </span>
              <span class="text-muted-foreground font-mono text-[12px]">
                ({formatTime(displayedSegment.start_sec)} – {formatTime(
                  displayedSegment.end_sec
                )})
              </span>
            </div>
            <div>
              {#if hoveredSegmentIndex !== null}
                <span
                  class="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-muted text-muted-foreground"
                >
                  Hovered Preview
                </span>
              {:else}
                <span
                  class="text-[10px] uppercase font-mono tracking-wider px-2 py-0.5 rounded bg-primary/15 text-primary font-medium"
                >
                  Active Playing
                </span>
              {/if}
            </div>
          </div>
          <EmotionsDisplay sortedEmotions={inspectorSortedEmotions} />
        </div>
        <div class="flex-1">
          <div class="font-semibold text-[14px] text-foreground">Full Song</div>
          <EmotionsDisplay {sortedEmotions} />
        </div>
        <EmotionLegend viewMode="audio_emotion" />
      </div>
    </div>
  {/if}
</div>
