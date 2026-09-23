<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3-zoom";
  import { select } from "d3-selection";
  import { library } from "$lib/audio/library.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { findNearestPoint } from "$lib/utils/math";
  import MapTooltip from "$lib/components/molecules/MapTooltip.svelte";
  import MapLegend from "$lib/components/molecules/MapLegend.svelte";
  import type { Track } from "$lib/types/track";
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

  let hoveredTrack = $state<Track | null>(null);
  let tooltipPos = $state<{ x: number; y: number }>({ x: 0, y: 0 });
  let tooltipEl = $state<HTMLDivElement | null>(null);

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
  export function fitToBounds(animate = true) {
    if (!canvasEl || !containerEl || !zoomBehavior) return;

    const tracks = library.filteredTracks.filter(
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
    const scaleX = (viewWidth * 0.85) / dataWidth;
    const scaleY = (viewHeight * 0.9) / dataHeight;
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
    const tracksToRender = library.filteredTracks;

    const dotRadius = Math.max(0.01, 4 / transform.k);

    // Draw non-playing and non-queued points first
    for (const track of tracksToRender) {
      if (track.coord_x == null || track.coord_y == null) continue;
      if (track.id === activeTrackId || queuedTrackIds.has(track.id)) continue;

      ctx.beginPath();
      ctx.arc(track.coord_x, track.coord_y, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = getTrackColor(track) || theme.defaultDot;
      ctx.globalAlpha = 0.85;
      ctx.fill();
    }

    // Draw Queued tracks (slightly larger with an outer accent stroke)
    for (const track of tracksToRender) {
      if (track.coord_x == null || track.coord_y == null) continue;
      if (track.id === activeTrackId || !queuedTrackIds.has(track.id)) continue;

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

    // Draw Actively Playing track (top-most priority with bold pulse halo)
    for (const track of tracksToRender) {
      if (track.coord_x == null || track.coord_y == null) continue;
      if (track.id !== activeTrackId) continue;

      // Outer bright halo
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

    if (
      hoveredTrack &&
      hoveredTrack.coord_x != null &&
      hoveredTrack.coord_y != null
    ) {
      ctx.beginPath();
      ctx.arc(
        hoveredTrack.coord_x,
        hoveredTrack.coord_y,
        dotRadius * 1.8,
        0,
        Math.PI * 2
      );
      ctx.strokeStyle = theme.haloBorder;
      ctx.lineWidth = 1.5 / transform.k;
      ctx.stroke();
    }

    ctx.globalAlpha = 1.0;
  }

  function handlePointerMove(event: PointerEvent) {
    if (!canvasEl || !containerEl) return;

    if (hoveredTrack && tooltipEl) {
      const cardRect = tooltipEl.getBoundingClientRect();
      const margin = 5;
      if (
        event.clientX >= cardRect.left - margin &&
        event.clientX <= cardRect.right + margin &&
        event.clientY >= cardRect.top - margin &&
        event.clientY <= cardRect.bottom + margin
      ) {
        return;
      }
    }

    const rect = canvasEl.getBoundingClientRect();

    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    const targetWorld = {
      x: (screenX - transform.x) / transform.k,
      y: (screenY - transform.y) / transform.k,
    };

    const nearest = findNearestPoint(
      library.filteredTracks,
      targetWorld,
      (t) =>
        t.coord_x != null && t.coord_y != null
          ? { x: t.coord_x, y: t.coord_y }
          : null,
      12 / transform.k
    );

    if (nearest) {
      hoveredTrack = nearest;

      // Measure real tooltip dimensions dynamically if mounted, or use safe fallbacks
      const cardWidth = tooltipEl?.offsetWidth ?? 288;
      const cardHeight = tooltipEl?.offsetHeight ?? 600;
      const gapX = 15,
        gapY = 50;

      // Horizontal positioning: prefer placing away from the center; flip if overflowing
      let posX = 0;
      if (screenX < rect.width / 2) {
        posX = screenX - cardWidth - gapX;
      }
      if (screenX >= rect.width / 2) {
        posX = screenX - gapX;
      }
      posX = Math.max(gapX, Math.min(posX, rect.width - cardWidth - gapX));

      // Vertical positioning: prefer placing at center; adjust if overflowing
      let posY = Math.max(screenY - cardHeight / 2, 0);
      if (posY + cardHeight > rect.height) {
        posY = rect.height - cardHeight - gapY;
      }

      tooltipPos = { x: posX, y: posY };
    } else {
      hoveredTrack = null;
    }

    draw();
  }

  function handlePointerLeave(event: PointerEvent) {
    if (
      tooltipEl &&
      event.relatedTarget instanceof Node &&
      tooltipEl.contains(event.relatedTarget)
    ) {
      return;
    }
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
      library.filteredTracks,
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

  // Re-draw automatically whenever the filtered list, queue, or active track updates
  $effect(() => {
    const _tracks = library.filteredTracks;
    const _queued = queuedTrackIds;
    const _active = player.currentTrack?.id;

    if (!hasAutoZoomed && _tracks.length > 0 && zoomBehavior) {
      const hasCoords = _tracks.some(
        (t) => t.coord_x != null && t.coord_y != null
      );
      if (hasCoords) {
        fitToBounds(false);
        hasAutoZoomed = true;
      }
    }
    draw();
  });
</script>

<div
  bind:this={containerEl}
  class={cn(
    "relative w-full h-full overflow-hidden bg-card select-none cursor-grab active:cursor-grabbing",
    className
  )}
>
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <canvas
    bind:this={canvasEl}
    onclick={handleCanvasClick}
    onpointermove={handlePointerMove}
    onpointerleave={handlePointerLeave}
    class="block w-full h-full"
  ></canvas>

  <MapLegend
    class="pointer-events-auto absolute right-3 top-3 z-40 max-w-[190px]"
  />

  {#if hoveredTrack}
    <MapTooltip
      bind:el={tooltipEl}
      track={hoveredTrack}
      x={tooltipPos.x}
      y={tooltipPos.y}
      isPlaying={player.currentTrack?.id === hoveredTrack.id}
      isQueued={queuedTrackIds.has(hoveredTrack.id)}
      onEnqueue={(t) => player.enqueue(t)}
      onPointerLeave={(e) => {
        if (e.relatedTarget !== canvasEl) {
          hoveredTrack = null;
          draw();
        }
      }}
    />
  {/if}
</div>
