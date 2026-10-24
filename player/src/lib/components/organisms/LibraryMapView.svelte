<script lang="ts">
  import { onMount } from "svelte";
  import * as d3 from "d3-zoom";
  import { select } from "d3-selection";
  import { library } from "$lib/core/library.svelte";
  import { player } from "$lib/core/player.svelte";
  import { findNearestPoint } from "$lib/utils/math";
  import MapTooltip from "$lib/components/molecules/MapTooltip.svelte";
  import MapLegend from "$lib/components/molecules/MapLegend.svelte";
  import type { Track } from "$lib/types/track";
  import {
    COWEN_EMOTION_COLORS,
    LYRIC_EMOTION_COLORS,
  } from "$lib/constants/emotions";
  import { cn } from "$lib/utils";

  // =========================================================================
  // 1. Types & View Strategies (Extraction Layer)
  // =========================================================================

  export type MapViewMode = "audio_emotion" | "lyrics_emotion";

  export interface MapCoordinates {
    x: number;
    y: number;
  }

  export interface MapViewDefinition {
    id: MapViewMode;
    label: string;
    description: string;
    getEmotions: (track: Track) => Record<string, number> | null;
    getCoordinates: (track: Track) => MapCoordinates | null;
    getColor: (emotion: string) => string;
  }

  /** Extract acoustic emotion coordinates (coord_x, coord_y) */
  function getAudioEmotionCoords(track: Track): MapCoordinates | null {
    if (
      track.coord_x != null &&
      track.coord_y != null &&
      !Number.isNaN(track.coord_x) &&
      !Number.isNaN(track.coord_y)
    ) {
      return { x: track.coord_x, y: track.coord_y };
    }
    return null;
  }

  /** Extract lyrical emotion coordinates from [x, y] tuple */
  function getLyricsEmotionCoords(track: Track): MapCoordinates | null {
    const raw = track.lyrics_emotions_coords;
    if (
      Array.isArray(raw) &&
      raw.length >= 2 &&
      raw[0] != null &&
      raw[1] != null &&
      !Number.isNaN(raw[0]) &&
      !Number.isNaN(raw[1])
    ) {
      return { x: Number(raw[0]), y: Number(raw[1]) };
    }
    return null;
  }

  /** Registry of available 2D map projections */
  export const MAP_VIEWS: Record<MapViewMode, MapViewDefinition> = {
    audio_emotion: {
      id: "audio_emotion",
      label: "Audio Mood",
      description: "Acoustic emotion manifold projected via MERT and UMAP",
      getEmotions: (track) => track.emotions,
      getCoordinates: getAudioEmotionCoords,
      getColor: (emotion) => COWEN_EMOTION_COLORS[emotion],
    },
    lyrics_emotion: {
      id: "lyrics_emotion",
      label: "Lyrics Mood",
      description: "Affective text manifold derived from lyrical content",
      getEmotions: (track) => track.lyrics_emotions,
      getCoordinates: getLyricsEmotionCoords,
      getColor: (emotion) => LYRIC_EMOTION_COLORS[emotion],
    },
  };

  // =========================================================================
  // 2. Component Props & Normalized Internal State
  // =========================================================================

  interface Props {
    queuedTrackIds: Set<string>;
    activeViewMode?: MapViewMode;
    class?: string;
  }

  let {
    queuedTrackIds,
    activeViewMode = $bindable("audio_emotion"),
    class: className = "",
  }: Props = $props();

  export interface RenderPoint {
    id: string;
    track: Track;
    x: number;
    y: number;
    color: string | null;
  }

  interface CanvasThemeTokens {
    accentRing: string;
    haloGlow: string;
    haloBorder: string;
    activeCore: string;
    defaultDot: string;
  }

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);
  let transform = $state(d3.zoomIdentity);
  let zoomBehavior: d3.ZoomBehavior<HTMLCanvasElement, unknown> | null = null;
  let hoveredPoint = $state<RenderPoint | null>(null);
  let lastFittedViewMode = $state<MapViewMode | null>(null);

  const activeViewConfig = $derived(
    MAP_VIEWS[activeViewMode] ?? MAP_VIEWS.audio_emotion
  );

  // =========================================================================
  // 3. Color & Token Resolvers
  // =========================================================================

  function getDominantEmotion(emotions: Record<string, number>): string | null {
    const [dominant] = Object.entries(emotions).reduce<[string, number]>(
      (best, [emotion, score]) => (activeViewConfig["getColor"](emotion) && score > best[1] ? [emotion, score] : best),
      ["", -1]
    );
    return dominant || null;
  }

  function getTrackColor(track: Track): string | null {
    const emotions = activeViewConfig["getEmotions"](track);
    if (!emotions) return null;
    const dominant = getDominantEmotion(emotions);
    console.log("dom", dominant);
    const color = dominant ? activeViewConfig["getColor"](dominant) : null;
    console.log("col", color);
    return color;
  }

  function resolveThemeTokens(element: HTMLElement): CanvasThemeTokens {
    const style = getComputedStyle(element);
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

  // =========================================================================
  // 4. Reactive Projections (Normalizing Track to RenderPoint)
  // =========================================================================

  /**
   * Projects raw library tracks through the active view's coordinate extractor.
   * Tracks missing coordinates for this view are safely filtered out.
   */
  const renderPoints = $derived.by<RenderPoint[]>(() => {
    const extractor = activeViewConfig.getCoordinates;
    const points: RenderPoint[] = [];

    for (const track of library.displayedTracks) {
      const coords = extractor(track);
      if (coords) {
        points.push({
          id: track.id,
          track,
          x: coords.x,
          y: coords.y,
          color: getTrackColor(track),
        });
      }
    }
    return points;
  });

  const highlightedPoint = $derived(
    library.highlightedTrackId
      ? (renderPoints.find((p) => p.id === library.highlightedTrackId) ?? null)
      : null
  );

  const activeTooltipTrack = $derived(
    hoveredPoint?.track ?? highlightedPoint?.track ?? null
  );

  // =========================================================================
  // 5. Shared Viewport & Bounds Fitting
  // =========================================================================

  function fitToBounds(animate = true) {
    if (!canvasEl || !containerEl || !zoomBehavior || renderPoints.length === 0)
      return;

    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    for (const p of renderPoints) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const dataWidth = maxX - minX || 1;
    const dataHeight = maxY - minY || 1;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    const rect = containerEl.getBoundingClientRect();
    const viewWidth = rect.width;
    const viewHeight = rect.height;

    const scaleX = (viewWidth * 0.95) / dataWidth;
    const scaleY = (viewHeight * 0.95) / dataHeight;
    const k = Math.min(scaleX, scaleY);

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

  // =========================================================================
  // 6. Generic Canvas Rendering Pipeline (Operates strictly on RenderPoint)
  // =========================================================================

  function drawNormalTrack(
    ctx: CanvasRenderingContext2D,
    point: RenderPoint,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = point.color || theme.defaultDot;
    ctx.globalAlpha = 0.85;
    ctx.fill();
  }

  function drawQueuedTrack(
    ctx: CanvasRenderingContext2D,
    point: RenderPoint,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    // Outer accent ring
    ctx.beginPath();
    ctx.arc(point.x, point.y, 1.625 * dotRadius, 0, Math.PI * 2);
    ctx.strokeStyle = theme.accentRing;
    ctx.lineWidth = 1.5 / transform.k;
    ctx.globalAlpha = 0.9;
    ctx.stroke();

    // Core point
    ctx.beginPath();
    ctx.arc(point.x, point.y, dotRadius, 0, Math.PI * 2);
    ctx.fillStyle = point.color || theme.defaultDot;
    ctx.globalAlpha = 1.0;
    ctx.fill();
  }

  function drawActiveTrack(
    ctx: CanvasRenderingContext2D,
    point: RenderPoint,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    const coreColor = point.color || theme.defaultDot;
    const haloRadius = dotRadius * 2.2;

    // 1. Soft radial glow
    const gradient = ctx.createRadialGradient(
      point.x,
      point.y,
      dotRadius * 0.8,
      point.x,
      point.y,
      haloRadius
    );
    gradient.addColorStop(0, coreColor);
    gradient.addColorStop(1, "transparent");

    ctx.beginPath();
    ctx.arc(point.x, point.y, haloRadius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.globalAlpha = 0.55;
    ctx.fill();

    // 2. Sharp primary accent perimeter ring
    ctx.beginPath();
    ctx.arc(point.x, point.y, haloRadius, 0, Math.PI * 2);
    ctx.strokeStyle = theme.accentRing;
    ctx.lineWidth = 1.5 / transform.k;
    ctx.globalAlpha = 0.85;
    ctx.stroke();

    // 3. Saturated Core Dot
    ctx.beginPath();
    ctx.arc(point.x, point.y, dotRadius * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = coreColor;
    ctx.globalAlpha = 1.0;
    ctx.fill();
  }

  function drawHighlightHalo(
    ctx: CanvasRenderingContext2D,
    point: RenderPoint,
    theme: CanvasThemeTokens,
    dotRadius: number
  ) {
    const outerRadius = dotRadius * 2.5;

    // Soft translucent wash
    ctx.beginPath();
    ctx.arc(point.x, point.y, outerRadius, 0, Math.PI * 2);
    ctx.fillStyle = theme.haloGlow;
    ctx.globalAlpha = 0.45;
    ctx.fill();

    // Outer beacon ring
    ctx.beginPath();
    ctx.arc(point.x, point.y, outerRadius, 0, Math.PI * 2);
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

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

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

    for (const point of renderPoints) {
      if (point.id === activeTrackId) {
        drawActiveTrack(ctx, point, theme, dotRadius);
      } else if (queuedTrackIds.has(point.id)) {
        drawQueuedTrack(ctx, point, theme, dotRadius);
      } else {
        drawNormalTrack(ctx, point, theme, dotRadius);
      }
    }

    if (hoveredPoint) drawHighlightHalo(ctx, hoveredPoint, theme, dotRadius);
    if (highlightedPoint)
      drawHighlightHalo(ctx, highlightedPoint, theme, dotRadius);

    ctx.globalAlpha = 1.0;
  }

  // =========================================================================
  // 7. Event Handlers & Canvas Interactions
  // =========================================================================

  function handlePointerMove(event: PointerEvent) {
    if (!canvasEl || !containerEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;

    const targetWorld = {
      x: (screenX - transform.x) / transform.k,
      y: (screenY - transform.y) / transform.k,
    };

    // Operates directly on projected points
    const nearest = findNearestPoint(
      renderPoints,
      targetWorld,
      (p) => ({ x: p.x, y: p.y }),
      12 / transform.k
    );

    hoveredPoint = nearest ?? null;
    draw();
  }

  function handlePointerLeave() {
    hoveredPoint = null;
    draw();
  }

  function handleCanvasClick(event: MouseEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();

    const targetWorld = {
      x: (event.clientX - rect.left - transform.x) / transform.k,
      y: (event.clientY - rect.top - transform.y) / transform.k,
    };

    const closestPoint = findNearestPoint(
      renderPoints,
      targetWorld,
      (p) => ({ x: p.x, y: p.y }),
      10 / transform.k
    );

    if (closestPoint) {
      const track = closestPoint.track;
      if (queuedTrackIds.has(track.id)) {
        player.removeTrackById(track.id);
      } else {
        player.enqueue(track);
      }
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

  function handleViewChange(mode: MapViewMode) {
    if (activeViewMode === mode) return;
    activeViewMode = mode;
    hoveredPoint = null;
  }

  // =========================================================================
  // 8. Lifecycle & Reactivity
  // =========================================================================

  onMount(() => {
    if (!canvasEl || !containerEl) return;

    zoomBehavior = d3
      .zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.1, 40])
      .on("zoom", (event) => {
        transform = event.transform;
        draw();
      });

    const canvasSelection = select(canvasEl);
    canvasSelection.call(zoomBehavior);

    const resizeObserver = new ResizeObserver(() => {
      resizeCanvas();
    });
    resizeObserver.observe(containerEl);
    resizeCanvas();

    return () => {
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    renderPoints;
    queuedTrackIds;
    player.currentTrack?.id;
    highlightedPoint;

    // Automatically re-center viewport when projection view changes or points first load
    if (
      zoomBehavior &&
      renderPoints.length > 0 &&
      lastFittedViewMode !== activeViewMode
    ) {
      const shouldAnimate = lastFittedViewMode !== null;
      lastFittedViewMode = activeViewMode;
      fitToBounds(shouldAnimate);
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
  <!-- Main Canvas Area -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    bind:this={containerEl}
    class="relative flex-1 min-w-0 h-full overflow-hidden cursor-grab active:cursor-grabbing rounded-lg border bg-background"
  >
    <!-- Floating View Mode Switcher -->
    <div
      class="absolute top-3 left-3 z-10 flex items-center p-0.5 rounded-lg bg-card/90 backdrop-blur-md border border-border/80 shadow-xs"
    >
      {#each Object.values(MAP_VIEWS) as viewDef}
        <button
          type="button"
          onclick={() => handleViewChange(viewDef.id)}
          class={cn(
            "px-2.5 py-1 text-xs font-medium rounded-md transition-all cursor-pointer",
            activeViewMode === viewDef.id
              ? "bg-primary text-primary-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
          title={viewDef.description}
        >
          {viewDef.label}
        </button>
      {/each}
    </div>

    <!-- Empty State Fallback -->
    {#if renderPoints.length === 0}
      <div
        class="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground pointer-events-none p-4 text-center"
      >
        <p class="text-sm font-medium">No coordinates available</p>
        <p class="text-xs text-muted-foreground/80 mt-1">
          {activeViewConfig.label} data has not been calculated for these tracks.
        </p>
      </div>
    {/if}

    <canvas
      bind:this={canvasEl}
      onclick={handleCanvasClick}
      onpointermove={handlePointerMove}
      onpointerleave={handlePointerLeave}
      class="block w-full h-full"
    ></canvas>
  </div>

  <!-- Sidebar: Legend & Tooltip Details -->
  <aside class="flex flex-col w-60 shrink-0 h-full overflow-hidden">
    <div class="shrink-0">
      <MapLegend class="w-full" viewMode={activeViewMode} />
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto">
      {#if activeTooltipTrack}
        <MapTooltip
          track={activeTooltipTrack}
          isPlaying={player.currentTrack?.id === activeTooltipTrack.id}
          isQueued={queuedTrackIds.has(activeTooltipTrack.id)}
          emotions={MAP_VIEWS[activeViewMode]["getEmotions"](activeTooltipTrack)}
          class="w-full"
        />
      {/if}
    </div>
  </aside>
</div>
