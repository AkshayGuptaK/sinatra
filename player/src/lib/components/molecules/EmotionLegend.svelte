<script lang="ts">
  import {
    COWEN_EMOTION_COLORS,
    LYRIC_EMOTION_COLORS,
  } from "$lib/constants/emotions";
  import { cn } from "$lib/utils";
  import type { EmotionMode } from "$lib/core/emotions.svelte";

  interface Props {
    class?: string;
    viewMode: EmotionMode;
    hoveredEmotion?: string | null;
  }

  let {
    class: className = "",
    viewMode,
    hoveredEmotion = $bindable(null),
  }: Props = $props();

  const viewModeColors = {
    audio_emotion: COWEN_EMOTION_COLORS,
    lyrics_emotion: LYRIC_EMOTION_COLORS,
  };

  const sortedEmotions = $derived(
    Object.entries(viewModeColors[viewMode])
      .map(([key, color]) => ({
        key,
        label: key === "contemplative" ? "solemn" : key,
        color,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  );
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class={cn(
    "flex flex-col gap-2 px-3 py-2 rounded-lg border border-border/70 bg-card/85 text-card-foreground shadow-lg backdrop-blur-md select-none w-60 shrink-0",
    className
  )}
  onpointerleave={() => (hoveredEmotion = null)}
>
  <h4
    class="text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground pb-1 border-b border-border/40"
  >
    Core Emotions
  </h4>

  <div class="flex flex-col gap-1 mt-0.5">
    {#each sortedEmotions as { key, label, color }}
      {@const isHovered = hoveredEmotion === key}
      {@const isDimmed = hoveredEmotion !== null && !isHovered}
      <div
        onpointerenter={() => (hoveredEmotion = key)}
        class={cn(
          "flex items-center gap-3 text-xs px-1.5 py-1 -mx-1.5 rounded-md transition-all cursor-pointer",
          isHovered && "bg-muted/70 text-foreground font-medium",
          isDimmed && "opacity-40"
        )}
      >
        <span
          class="size-2.5 rounded-full shrink-0 shadow-xs"
          style="background-color: {color};"
        ></span>
        <span
          class={cn(
            "truncate capitalize text-[11px] leading-tight",
            isHovered ? "text-foreground" : "text-foreground/80"
          )}
        >
          {label}
        </span>
      </div>
    {/each}
  </div>
</div>
