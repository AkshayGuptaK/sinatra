<script lang="ts">
  import type { Track } from "$lib/types/track";
  import { Check, Play } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import {
    getTrackDisplayAttribution,
    getTrackDisplayTitle,
  } from "$lib/utils/display";
  import EmotionsDisplay from "./EmotionsDisplay.svelte";
  import { sortEmotions } from "$lib/core/emotions.svelte";

  interface Props {
    track: Track | null;
    isPlaying: boolean;
    isQueued: boolean;
    emotions: Record<string, number> | null;
    class?: string;
  }

  let {
    track,
    isPlaying,
    isQueued,
    emotions,
    class: className = "",
  }: Props = $props();

  let displayTitle = $derived(getTrackDisplayTitle(track));
  let displayArtist = $derived(getTrackDisplayAttribution(track));

  const sortedEmotions = $derived.by(() => {
    return sortEmotions(emotions);
  });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={cn(
    "flex flex-col w-full h-full rounded-lg border border-border/80 bg-card/95 p-3 text-card-foreground backdrop-blur-md select-none",
    className
  )}
>
  <!-- Header: Title, Artist, and Status Action -->
  {#if track}
    <div
      class="flex items-start justify-between gap-2 border-b border-border/50 pb-2"
    >
      <div class="min-w-0 flex-1">
        <h3
          class="truncate text-sm font-semibold text-foreground"
          title={displayTitle}
        >
          {displayTitle}
        </h3>
        <p class="truncate text-xs text-muted-foreground" title={displayArtist}>
          {displayArtist}
        </p>
      </div>

      <!-- Status Indicator -->
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
        {/if}
      </div>
    </div>

    <EmotionsDisplay {sortedEmotions} />
  {:else}
  <div class="flex px-6 h-full items-center justify-center text-xs text-muted-foreground">
    Hover over a track to see its emotions.
  </div>
  {/if}
</div>
