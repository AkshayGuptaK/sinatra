<script lang="ts">
  import {
    COWEN_EMOTION_COLORS,
    LYRIC_EMOTION_COLORS,
  } from "$lib/constants/emotions";
  import { cn } from "$lib/utils";
  import type { MapViewMode } from "../organisms/LibraryMapView.svelte";

  interface Props {
    class?: string;
    viewMode: MapViewMode;
  }

  let { class: className = "", viewMode }: Props = $props();

  const viewModeColors = {
    audio_emotion: COWEN_EMOTION_COLORS,
    lyrics_emotion: LYRIC_EMOTION_COLORS,
  };

  const sortedEmotions = $derived(
    Object.entries(viewModeColors[viewMode])
      .map(([name, color]) => ({
        name: name === "contemplative" ? "solemn" : name,
        color,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
</script>

<div
  class={cn(
    "flex flex-col gap-2 p-3 rounded-lg border border-border/70 bg-card/85 text-card-foreground shadow-lg backdrop-blur-md select-none w-60 shrink-0",
    className
  )}
>
  <h4
    class="text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground pb-1 border-b border-border/40"
  >
    Core Emotions
  </h4>

  <div class="flex flex-col gap-2 mt-1">
    {#each sortedEmotions as { name, color }}
      <div class="flex items-center gap-3 text-xs">
        <span
          class="size-2.5 rounded-full shrink-0 shadow-xs"
          style="background-color: {color};"
        ></span>
        <span
          class="truncate capitalize text-foreground/80 text-[11px] leading-tight"
        >
          {name}
        </span>
      </div>
    {/each}
  </div>
</div>
