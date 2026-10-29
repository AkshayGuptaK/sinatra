<script lang="ts">
  import { COWEN_EMOTION_COLORS } from "$lib/constants/emotions";
  import { player } from "$lib/core/player.svelte";
  import type { TrackSegment } from "$lib/types/track";
  import EmotionsDisplay from "$lib/components/atoms/EmotionsDisplay.svelte";
  import { formatTime } from "$lib/utils/time";
  import { cn } from "$lib/utils";

  const EMOTION_THRESHOLD = 0.3;
  const INSPECTOR_THRESHOLD_PCT = 30;

  interface Props {
    segments: TrackSegment[];
    duration: number;
    currentTime: number;
    class?: string;
  }

  let {
    segments = [],
    duration = 0,
    currentTime = 0,
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

  // Fallback track duration to prevent divide-by-zero
  const trackDuration = $derived(
    duration > 0
      ? duration
      : segments.length > 0
        ? segments[segments.length - 1].end_sec
        : 1
  );

  const playheadX = $derived(
    Math.min(1000, Math.max(0, (currentTime / trackDuration) * 1000))
  );

  // Active playing segment index based on clock
  const activePlayingSegmentIndex = $derived(
    segments.findIndex(
      (s) => currentTime >= s.start_sec && currentTime < s.end_sec
    )
  );

  // Target segment to display in the inspector dock: hovered overrides playing
  const displayedSegment = $derived.by(() => {
    if (hoveredSegmentIndex !== null && segments[hoveredSegmentIndex]) {
      return segments[hoveredSegmentIndex];
    }
    if (
      activePlayingSegmentIndex !== -1 &&
      segments[activePlayingSegmentIndex]
    ) {
      return segments[activePlayingSegmentIndex];
    }
    return segments[0] ?? null;
  });

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

  function handleTimelineClick(event: MouseEvent) {
    if (!containerEl || trackDuration <= 0) return;
    const rect = containerEl.getBoundingClientRect();
    const clickRatio = Math.max(
      0,
      Math.min(1, (event.clientX - rect.left) / rect.width)
    );
    player.engine.seekTo(clickRatio * trackDuration);
  }

  // Placeholder synthetic RMS envelope until backend RMS is connected
  const mockRmsPath = $derived.by(() => {
    if (segments.length === 0) return "";
    const points: string[] = ["M 0 280"];
    const step = 1000 / segments.length;

    segments.forEach((seg, i) => {
      const x = i * step;
      const energy = seg.emotions_normalized["energizing/pump-up"] || 0.4;
      const calm = seg.emotions_normalized["calm/relaxing/serene"] || 0.2;
      const height =
        280 -
        Math.min(220, Math.max(40, (energy * 1.4 - calm * 0.5 + 0.3) * 160));
      points.push(`L ${x.toFixed(1)} ${height.toFixed(1)}`);
    });

    points.push("L 1000 280 Z");
    return points.join(" ");
  });
</script>

<div class={cn("flex flex-col gap-4 w-full", className)}>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={containerEl}
    onclick={handleTimelineClick}
    onpointerleave={() => {
      hoveredSegmentIndex = null;
      hoveredEmotion = null;
    }}
    class="relative w-full h-72 rounded-xl border border-border/60 bg-card/40 backdrop-blur-sm p-4 overflow-hidden select-none cursor-pointer"
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
      {#if mockRmsPath}
        <path
          d={mockRmsPath}
          fill="url(#rms-gradient)"
          class="transition-all duration-300 pointer-events-none"
        />
      {/if}

      <!-- 2. Segment Columns & Emotion Horizontal Bars -->
      {#each segments as seg, idx (seg.chunk_index)}
        {@const segStartX = (seg.start_sec / trackDuration) * 1000}
        {@const segWidth = Math.max(
          2,
          ((seg.end_sec - seg.start_sec) / trackDuration) * 1000
        )}
        {@const isCurrentSegment = activePlayingSegmentIndex === idx}
        {@const isHoveredSegment = hoveredSegmentIndex === idx}

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

          {#each Object.entries(seg.emotions_normalized) as [emotion, score]}
            {#if score >= EMOTION_THRESHOLD && COWEN_EMOTION_COLORS[emotion]}
              {@const y = 280 - score * 260}
              {@const color = COWEN_EMOTION_COLORS[emotion]}

              <rect
                x={segStartX + 1}
                {y}
                width={Math.max(1, segWidth - 2)}
                height="5"
                rx="2.5"
                fill={color}
                filter={isCurrentSegment || isHoveredSegment
                  ? "url(#bar-glow)"
                  : undefined}
                class="cursor-pointer transition-all duration-150 hover:brightness-135 hover:[filter:url(#bar-hover-glow)]"
                onpointerenter={(e) => {
                  hoveredEmotion = {
                    name: emotion,
                    score: Math.round(score * 100),
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
            {/if}
          {/each}
        </g>
      {/each}

      <!-- 3. Current Playhead Vertical Line -->
      <line
        x1={playheadX.toFixed(1)}
        y1="0"
        x2={playheadX.toFixed(1)}
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
    <div
      class="w-full rounded-xl border border-border/50 bg-card/30 p-4 backdrop-blur-xs flex flex-col gap-3"
    >
      <div
        class="flex items-center justify-between text-xs border-b border-border/40 pb-2"
      >
        <div class="flex items-center gap-2">
          <span class="font-semibold text-foreground">
            Segment {displayedSegment.chunk_index + 1}
          </span>
          <span class="text-muted-foreground font-mono text-[11px]">
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
  {/if}
</div>
