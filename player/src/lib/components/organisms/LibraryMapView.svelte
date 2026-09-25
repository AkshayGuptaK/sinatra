<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3-zoom";
  import { select } from "d3-selection";
  import { library } from "$lib/audio/library.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { findNearestPoint } from "$lib/utils/math";
  import MapTooltip from "$lib/components/molecules/MapTooltip.svelte";
  import MapLegend from "$lib/components/molecules/MapLegend.svelte";
  import {
    isTrackWithCoordinates,
    type ProjectableTrack,
    type Track,
  } from "$lib/types/track";
  import { EMOTION_COLORS } from "$lib/constants/emotions";
  import { cn } from "$lib/utils";

  interface Props {
    queuedTrackIds: Set<string>;
    class?: string;
  }

  let { queuedTrackIds, class: className = "" }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let transform = $state(d3.zoomIdentity);
  let zoomBehavior: d3.ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
  let hasAutoZoomed = $state(false);

  let hoveredTrack = $state<ProjectableTrack | null>(null);

  const tracksToRender = $derived(
    library.displayedTracks.filter(isTrackWithCoordinates)
  );

  const highlightedTrack = $derived(
    library.highlightedTrackId
      ? (tracksToRender.find((t) => t.id === library.highlightedTrackId) ??
          null)
      : null
  );

  const activeTooltipTrack = $derived(hoveredTrack ?? highlightedTrack);

  interface CanvasThemeTokens {
    accentRing: string; // Ring around queued items
    haloGlow: string; // Active track outer halo
    haloBorder: string; // Active track outline
    activeCore: string; // Active track inner dot
    defaultDot: string; // Fallback dot color
  }

  function getDominantEmotion(emotions: Record<string, number>): string | null {
    const [dominant] = Object.entries(emotions).reduce<[string, number]>(
      (best, [emotion, score]) =>
        EMOTION_COLORS[emotion] && score > best[1] ? [emotion, score] : best,
      ["", -1]
    );

    return dominant || null;
  }

  function getTrackColor(track: Track): string | null {
    if (!track.emotions) return null;
    const dominant = getDominantEmotion(track.emotions);
    return dominant ? EMOTION_COLORS[dominant] : null;
  }

  function resolveThemeTokens(element: HTMLElement): CanvasThemeTokens {
    const style = getComputedStyle(element);
    const isDark = element.closest(".dark") !== null;

    // Read CSS variables dynamically from the active skin / light-dark variant
    const primary = style.getPropertyValue("--primary").trim() || "#000000";
    const foreground = style.getPropertyValue("--foreground").trim() || primary;
    const accentForeground =
      style.getPropertyValue("--accent-foreground").trim() || foreground;
    const mutedForeground =
      style.getPropertyValue("--muted-foreground").trim() || accentForeground;

    return {
      accentRing: accentForeground,
      haloGlow: foreground,
      haloBorder: mutedForeground,
      activeCore: primary,
      defaultDot: mutedForeground,
    };
  }

  /**
   * Calculates bounds and sets D3 Zoom to fit all points snugly within the view.
   */
  function fitToBounds(animate = true) {
    if (!canvasEl || !containerEl || !zoomBehavior) return;

    const tracks = library.displayedTracks.filter(
      (t) => t.coord_x != null && t.coord_y != null
    );

    if (tracks.length === 0) return;

    // 1. Calculate bounding box: min/max across both axes
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const t of tracks) {
      const x = t.coord_x!;
      const y = t.coord_y!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }

    const dataWidth = maxX - minX || 1;
    const dataHeight = maxY - minY || 1;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const rect = containerEl.getBoundingClientRect();
    const viewWidth = rect.width;
    const viewHeight = rect.height;

    // 2. Compute scale factor
    const scaleX = (viewWidth * 0.95) / dataWidth;
    const scaleY = (viewHeight * 0.95) / dataHeight;
    const k = Math.min(scaleX, scaleY);

    // 3. Compute translation to place midpoint at viewport center
    const tx = viewWidth / 2 - midX * k;
    const ty = viewHeight / 2 - midY * k;

    const targetTransform = d3.zoomIdentity.translate(tx, ty).scale(k);

    const selection = select(canvasEl);
    if (animate) {
      selection
        .transition()
        .duration(500)
        .call(zoomBehavior.transform, targetTransform);
    } else {
      selection.call(zoomBehavior.transform, targetTransform);
    }
  }

  function drawNormalTrack(
    ctx: CanvasRenderingContext2D,
    track: ProjectableTrack,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    ctx.beginPath();
    ctx.arc(track.coord_x, track.coord_y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = getTrackColor(track) || theme.defaultDot;
    ctx.globalAlpha = 0.85;
    ctx.fill();
  }

  function drawQueuedTrack(
    ctx: CanvasRenderingContext2D,
    track: ProjectableTrack,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    // Outer accent ring
    ctx.beginPath();
    ctx.arc(track.coord_x, track.coord_y, 1.625 * dotRadius, 0, Math.PI * 2);
    ctx.strokeStyle = theme.accentRing;
    ctx.lineWidth = 1.5 / transform.k;
    ctx.globalAlpha = 0.9;
    ctx.stroke();

    // Core point
    ctx.beginPath();
    ctx.arc(track.coord_x, track.coord_y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = getTrackColor(track) || theme.defaultDot;
    ctx.globalAlpha = 1.0;
    ctx.fill();
  }

  function drawActiveTrack(
    ctx: CanvasRenderingContext2D,
    track: ProjectableTrack,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    //  Outer bright halo
    ctx.beginPath();
    ctx.arc(track.coord_x, track.coord_y, 2.25 * dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = theme.haloGlow;
    ctx.fill();
    ctx.strokeStyle = theme.haloBorder;
    ctx.lineWidth = 2 / transform.k;
    ctx.stroke();

    // Core
    ctx.beginPath();
    ctx.arc(track.coord_x, track.coord_y, 1.25 * dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = theme.activeCore;
    ctx.globalAlpha = 1.0;
    ctx.fill();
  }

  function drawHightlightHalo(
    ctx: CanvasRenderingContext2D,
    track: ProjectableTrack,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    const outerRadius = dotRadius * 2.5;

    // Soft translucent wash (shows clearly over unqueued and queued dots)
    ctx.beginPath();
    ctx.arc(track.coord_x, track.coord_y, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = theme.haloGlow;
    ctx.globalAlpha = 0.45;
    ctx.fill();

    // Outer beacon ring
    ctx.beginPath();
    ctx.arc(track.coord_x, track.coord_y, outerRadius, 0, Math.PI * 2);
    ctx.strokeStyle = theme.haloBorder;
    ctx.lineWidth = 1.75 / transform.k;
    ctx.globalAlpha = 0.95;
    ctx.stroke();
  }

  function draw() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const width = canvasEl.width;
    const height = canvasEl.height;
    const dpr = window.devicePixelRatio || 1;
    const theme = resolveThemeTokens(canvasEl);

    // Reset transform & clear frame
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Apply device pixel ratio and D3 zoom/pan transformations
    ctx.setTransform(
      transform.k * dpr,
      0,
      0,
      transform.k * dpr,
      transform.x * dpr,
      transform.y * dpr
    );

    const activeTrackId = player.currentTrack?.id;
    const dotRadius = Math.max(0.01, 4 / transform.k);

    for (const track of tracksToRender) {
      if (track.id === activeTrackId) {
        drawActiveTrack(ctx, track, theme, dotRadius);
      } else if (queuedTrackIds.has(track.id)) {
        drawQueuedTrack(ctx, track, theme, dotRadius);
      } else {
        drawNormalTrack(ctx, track, theme, dotRadius);
      }
    }

    if (hoveredTrack) drawHightlightHalo(ctx, hoveredTrack, theme, dotRadius);
    if (highlightedTrack)
      drawHightlightHalo(ctx, highlightedTrack, theme, dotRadius);

    ctx.globalAlpha = 1.0;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!canvasEl || !containerEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    const targetWorld = {
      x: (screenX - transform.x) / transform.k,
      y: (screenY - transform.y) / transform.k,
    };

    const nearest = findNearestPoint(
      library.displayedTracks,
      targetWorld,
      (t) =>
        t.coord_x != null && t.coord_y != null
          ? { x: t.coord_x, y: t.coord_y }
          : null,
      12 / transform.k
    );

    hoveredTrack = (nearest as ProjectableTrack) ?? null;
    draw();
  }

  function handlePointerLeave() {
    hoveredTrack = null;
    draw();
  }

  function handleCanvasClick(event: MouseEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();

    const targetWorld = {
      x: (event.clientX - rect.left - transform.x) / transform.k,
      y: (event.clientY - rect.top - transform.y) / transform.k,
    };

    const closestTrack = findNearestPoint(
      library.displayedTracks,
      targetWorld,
      (t) =>
        t.coord_x != null && t.coord_y != null
          ? { x: t.coord_x, y: t.coord_y }
          : null,
      10 / transform.k
    );

    if (closestTrack) {
      player.enqueue(closestTrack);
    }
  }

  function resizeCanvas() {
    if (!canvasEl || !containerEl) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = containerEl.getBoundingClientRect();

    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;
    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;

    draw();
  }

  onMount(() => {
    if (!canvasEl || !containerEl) return;

    // Initialize D3 Zoom Behavior
    zoomBehavior = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 40])
      .on("zoom", (event) => {
        transform = event.transform;
        draw();
      });

    const canvasSelection = select(canvasEl);
    canvasSelection.call(zoomBehavior);

    // Handle viewport resize
    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(containerEl);
    resizeCanvas();

    return () => {
      resizeObserver.disconnect();
    };
  });

  // Re-draw automatically
  $effect(() => {
    tracksToRender;
    queuedTrackIds;
    player.currentTrack?.id;
    highlightedTrack;

    if (!hasAutoZoomed && tracksToRender.length > 0 && zoomBehavior) {
      fitToBounds(false);
      hasAutoZoomed = true;
    }
    draw();
  });
</script>

<div
  class={cn(
    "relative flex flex-row w-full h-full min-h-0 overflow-hidden bg-card select-none p-1 gap-3",
    className
  )}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={containerEl}
    class="relative flex-1 min-w-0 h-full overflow-hidden cursor-grab active:cursor-grabbing"
  >
    <canvas
      bind:this={canvasEl}
      onclick={handleCanvasClick}
      onpointermove={handlePointerMove}
      onpointerleave={handlePointerLeave}
      class="block w-full h-full"
    ></canvas>
  </div>

  <aside class="flex flex-col w-60 shrink-0 h-full overflow-hidden">
    <!-- Top: Emotion Legend (interactive/scrollable if needed) -->
    <div class="shrink-0">
      <MapLegend class="w-full" />
    </div>

    <!-- Bottom: Fixed Slot for Hover Details -->
    <div class="flex-1 min-h-0 overflow-y-auto">
      {#if activeTooltipTrack}
        <MapTooltip
          track={activeTooltipTrack}
          isPlaying={player.currentTrack?.id === activeTooltipTrack.id}
          isQueued={queuedTrackIds.has(activeTooltipTrack.id)}
          class="w-full"
        />
      {/if}
    </div>
  </aside>
</div>
