<script lang="ts">
  import type { Track } from "$lib/types/track";
  import { Plus, Check, Play } from "@lucide/svelte";

  interface Props {
    track: Track;
    x: number;
    y: number;
    isPlaying: boolean;
    isQueued: boolean;
    onEnqueue: (track: Track) => void;
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
  }

  let {
    track,
    x,
    y,
    isPlaying,
    isQueued,
    onEnqueue,
    onPointerEnter,
    onPointerLeave,
  }: Props = $props();

  // Extract all emotions, sort descending, filter out near-zero values
  const sortedEmotions = $derived.by(() => {
    if (!track.emotions) return [];
    return Object.entries(track.emotions)
      .map(([name, score]) => ({
        name,
        pct: Math.round(Number(score) * 100),
      }))
      .filter((e) => e.pct > 0)
      .sort((a, b) => b.pct - a.pct);
  });
</script>

<!-- Floating Card Container -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerenter={onPointerEnter}
  onpointerleave={onPointerLeave}
  class="pointer-events-auto absolute z-50 w-72 rounded-lg border border-border/80 bg-card/95 p-3 text-card-foreground shadow-xl backdrop-blur-md transition-all select-none"
  style="left: {x + 16}px; top: {y + 16}px;"
>
  <!-- Header: Title, Artist, and Status Action -->
  <div
    class="flex items-start justify-between gap-2 border-b border-border/50 pb-2"
  >
    <div class="min-w-0 flex-1">
      <h3
        class="truncate text-sm font-semibold text-foreground"
        title={track.title}
      >
        {track.title || "Unknown Title"}
      </h3>
      <p class="truncate text-xs text-muted-foreground" title={track.artist}>
        {track.artist || "Unknown Artist"}
      </p>
      {#if track.mood}
        <span
          class="mt-1 inline-block rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground capitalize"
        >
          {track.mood}
        </span>
      {/if}
    </div>

    <!-- Status Indicator / Queue Button -->
    <div class="shrink-0 pt-0.5">
      {#if isPlaying}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary"
        >
          <Play class="size-3 fill-primary" />
          Playing
        </span>
      {:else if isQueued}
        <span
          class="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
        >
          <Check class="size-3 text-primary" />
          In Queue
        </span>
      {:else}
        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            onEnqueue(track);
          }}
          class="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
          title="Add to Queue"
        >
          <Plus class="size-3.5" />
          Queue
        </button>
      {/if}
    </div>
  </div>

  <!-- Emotions Percentage Breakdown -->
  <div class="mt-2 space-y-1.5 pr-1">
    {#if sortedEmotions.length > 0}
      {#each sortedEmotions as emotion}
        <div class="space-y-0.5">
          <div class="flex justify-between text-[11px]">
            <span class="text-muted-foreground capitalize">{emotion.name}</span>
            <span class="font-mono text-[10px] font-semibold text-foreground/80"
              >{emotion.pct}%</span
            >
          </div>
          <!-- Mini Progress Bar -->
          <div class="h-1 w-full overflow-hidden rounded-full bg-muted/60">
            <div
              class="h-full rounded-full bg-primary/70 transition-all duration-300"
              style="width: {emotion.pct}%"
            ></div>
          </div>
        </div>
      {/each}
    {:else}
      <p class="py-1 text-center text-xs italic text-muted-foreground">
        No emotion scores available
      </p>
    {/if}
  </div>
</div>
