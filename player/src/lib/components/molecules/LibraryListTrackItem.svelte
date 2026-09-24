<script lang="ts">
  import type { Track } from "$lib/types/track";
  import type { MetadataFields } from "$lib/types/metadata";
  import { formatTime } from "$lib/utils/time";
  import { Volume2, Plus } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import InlineEditableCell from "$lib/components/atoms/InlineEditableCell.svelte";
  import EditableTagList from "$lib/components/molecules/EditableTagList.svelte";
  import { cn } from "$lib/utils";

  interface Props {
    track: Track;
    isActive?: boolean;
    isPlaying?: boolean;
    isQueued?: boolean;
    class?: string;
    onPlay?: (track: Track) => void;
    onEnqueue?: (track: Track) => void;
    onUpdate?: (fields: MetadataFields) => void;
  }

  let {
    track,
    isActive = false,
    isPlaying = false,
    isQueued = false,
    class: className = "",
    onEnqueue,
    onUpdate,
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
    "group grid grid-cols-[1.5rem_minmax(160px,2fr)_minmax(120px,1.5fr)_minmax(120px,1.5fr)_minmax(80px,0.6fr)_minmax(120px,1.5fr)_5rem_3.5rem] items-center px-4 py-2 text-sm rounded-md transition-colors cursor-pointer select-none",
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
    {:else if isQueued}
      <span class="size-1.5 rounded-full bg-primary/60 group-hover:bg-primary"
      ></span>
    {/if}
  </div>

  <!-- Title -->
  <div class="truncate pr-4 font-medium" title={track.title}>
    <InlineEditableCell
      value={track.title}
      placeholder="Unknown Title"
      class={cn("font-medium", isActive && "text-primary")}
      onSave={(val) => onUpdate?.({ title: val })}
    />
  </div>

  <!-- Artist -->
  <div
    class="truncate pr-4 text-muted-foreground text-xs sm:text-sm"
    title={track.artist}
  >
    <InlineEditableCell
      value={track.artist}
      placeholder="Unknown Artist"
      class="text-xs sm:text-sm text-muted-foreground"
      onSave={(val) => onUpdate?.({ artist: val })}
    />
  </div>

  <!-- Album -->
  <div
    class="truncate pr-4 text-muted-foreground text-xs sm:text-sm"
    title={track.album}
  >
    <InlineEditableCell
      value={track.album || ""}
      placeholder="—"
      class="text-xs sm:text-sm text-muted-foreground"
      onSave={(val) => onUpdate?.({ album: val })}
    />
  </div>

  <!-- Mood -->
  <div class="truncate pr-4 text-xs" title={track.mood}>
    <InlineEditableCell
      value={track.mood || ""}
      placeholder="—"
      class={track.mood
        ? "text-xs font-medium text-muted-foreground"
        : "text-muted-foreground/60"}
      onSave={(val) => onUpdate?.({ mood: val })}
    />
  </div>

  <!-- Tags -->
  <div class="min-w-0 pr-2">
    <EditableTagList
      tags={track.tags ?? []}
      onChange={(nextTags) => onUpdate?.({ tags: nextTags })}
    />
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
