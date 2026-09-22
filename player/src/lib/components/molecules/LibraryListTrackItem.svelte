<script lang="ts">
  import type { Track } from "$lib/types/track";
  import { formatTime } from "$lib/utils/time";
  import { Volume2, Plus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";

  interface Props {
    track: Track;
    isActive?: boolean;
    isPlaying?: boolean;
    class?: string;
    onPlay?: (track: Track) => void;
    onEnqueue?: (track: Track) => void;
  }

  let {
    track,
    isActive = false,
    isPlaying = false,
    class: className = "",
    onEnqueue,
  }: Props = $props();

  function handleEnqueue(e: MouseEvent) {
    e.stopPropagation();
    onEnqueue?.(track);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  ondblclick={() => onEnqueue?.(track)}
  class={cn(
    "group grid grid-cols-[1.5rem_minmax(180px,2fr)_minmax(140px,1.5fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_5rem_3.5rem] items-center px-4 py-2 text-sm rounded-md transition-colors cursor-pointer select-none",
    isActive
      ? "bg-accent/70 text-accent-foreground font-medium"
      : "hover:bg-muted/50 text-foreground",
    className
  )}
>
  <!-- # / Playing Indicator -->
  <div class="flex items-center text-xs text-muted-foreground font-mono">
    {#if isActive && isPlaying}
      <Volume2 class="size-4 text-primary animate-pulse" />
    {/if}
  </div>

  <!-- Title -->
  <div class="truncate pr-4 font-medium" title={track.title}>
    <span class={cn(isActive && "text-primary")}
      >{track.title || "Unknown Title"}</span
    >
  </div>

  <!-- Artist -->
  <div
    class="truncate pr-4 text-muted-foreground text-xs sm:text-sm"
    title={track.artist}
  >
    {track.artist || "Unknown Artist"}
  </div>

  <!-- Album -->
  <div
    class="truncate pr-4 text-muted-foreground text-xs sm:text-sm"
    title={track.album}
  >
    {track.album || "—"}
  </div>

  <!-- Mood -->
  <div class="truncate pr-4 text-xs" title={track.mood}>
    {#if track.mood}
      <span
        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted border text-muted-foreground capitalize"
      >
        {track.mood}
      </span>
    {:else}
      <span class="text-muted-foreground/60">—</span>
    {/if}
  </div>

  <!-- Duration -->
  <div
    class="font-mono text-xs text-muted-foreground tabular-nums text-right pr-2"
  >
    {formatTime(track.duration ?? 0)}
  </div>

  <!-- Hover Action: Add to Queue -->
  <div class="flex justify-end">
    <Button
      variant="ghost"
      size="icon"
      aria-label="Add track to queue"
      title="Add to queue"
      onclick={handleEnqueue}
      class="size-7 p-0 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
    >
      <Plus class="size-4" />
    </Button>
  </div>
</div>
