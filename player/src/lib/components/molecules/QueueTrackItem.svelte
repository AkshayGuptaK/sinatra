<script lang="ts">
  import { type Track } from "$lib/types/track";
  import { formatTime } from "$lib/utils/time";
  import { Volume2, X, GripVertical } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import MiniBarVisualizer from "$lib/components/atoms/MiniBarVisualizer.svelte";
  import { cn } from "$lib/utils";
  import { getTrackDisplayAttribution, getTrackDisplayTitle } from "$lib/utils/display";

  interface Props {
    track: Track;
    index: number;
    isActive?: boolean;
    isPlaying?: boolean;
    class?: string;
    onSelect?: (index: number) => void;
    onRemove?: (index: number) => void;
    onDragStart?: (e: DragEvent, index: number) => void;
    onDragOver?: (e: DragEvent, index: number) => void;
    onDrop?: (e: DragEvent, index: number) => void;
    onDragEnd?: () => void;
  }

  let {
    track,
    index,
    isActive = false,
    isPlaying = false,
    class: className = "",
    onSelect,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
  }: Props = $props();

  let displayTitle = $derived(getTrackDisplayTitle(track));
  let displayArtist = $derived(getTrackDisplayAttribution(track));

  function handleRemove(event: MouseEvent) {
    event.stopPropagation();
    onRemove?.(index);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  draggable="true"
  ondragstart={(e) => onDragStart?.(e, index)}
  ondragover={(e) => {
    console.log("draggy");
    onDragOver?.(e, index);
  }}
  ondrop={(e) => onDrop?.(e, index)}
  ondragend={onDragEnd}
  onclick={() => onSelect?.(index)}
  class={cn(
    "group flex items-center justify-between gap-3 px-2 py-2 rounded-lg cursor-pointer select-none transition-colors text-sm",
    isActive
      ? "bg-accent/70 text-accent-foreground font-medium"
      : "hover:bg-muted/50 text-foreground",
    className
  )}
>
  <div class="flex items-center gap-1 min-w-0">
    <div class="flex items-center gap-1 shrink-0">
      <span
        class="flex items-center justify-center size-8 font-mono text-xs text-muted-foreground group-hover:hidden"
      >
        {#if isActive && isPlaying}
          <Volume2 class="size-4 animate-pulse text-primary inline-block" />
        {/if}
      </span>

      <div class="hidden group-hover:flex items-center">
        <div
          class="cursor-grab active:cursor-grabbing py-1 text-muted-foreground/60 hover:text-foreground transition-colors"
          title="Drag to reorder"
        >
          <GripVertical class="size-3.5" />
        </div>

        <Button
          variant="ghost"
          size="icon"
          aria-label={`Remove ${displayTitle} from queue`}
          title="Remove from queue"
          onclick={handleRemove}
          class="size-4.5 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <X class="size-3.5" />
        </Button>
      </div>
    </div>

    <div class="flex flex-col min-w-0">
      <span class={cn("truncate font-medium", isActive && "text-primary")}>
        {displayTitle}
      </span>
      <span class="truncate min-h-3 text-xs text-muted-foreground">
        {displayArtist}
      </span>
    </div>
  </div>

  <div class="flex items-center justify-between gap-3 shrink-0">
    {#if isActive}
      <MiniBarVisualizer {isPlaying} bars={8} />
    {/if}
    <span class="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
      {formatTime(track.duration ?? 0)}
    </span>
  </div>
</div>
