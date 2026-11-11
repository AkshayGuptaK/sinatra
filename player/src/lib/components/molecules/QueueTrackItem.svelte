<script lang="ts">
  import { type QueuedTrack } from "$lib/types/track";
  import { formatTime } from "$lib/utils/time";
  import { Volume2, X, GripVertical, Download, Disc3 } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";
  import {
    getTrackDisplayAttribution,
    getTrackDisplayTitle,
  } from "$lib/utils/display";

  interface Props {
    track: QueuedTrack;
    index: number;
    onHover: (trackId: string) => void;
    onHoverEnd: (trackId: string) => void;
    isActive?: boolean;
    isPlaying?: boolean;
    isAutoDjAnchor?: boolean;
    class?: string;
    onSelect?: (index: number) => void;
    onRemove?: (index: number) => void;
    onDragStart?: (e: DragEvent, index: number) => void;
    onDragOver?: (e: DragEvent, index: number) => void;
    onDrop?: (e: DragEvent, index: number) => void;
    onDragEnd?: () => void;
    onDownload?: (track: QueuedTrack) => void;
  }

  let {
    track,
    index,
    isActive = false,
    isPlaying = false,
    isAutoDjAnchor = false,
    class: className = "",
    onHover,
    onHoverEnd,
    onSelect,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onDownload,
  }: Props = $props();

  let displayTitle = $derived(getTrackDisplayTitle(track));
  let displayArtist = $derived(getTrackDisplayAttribution(track));

  function handleRemove(event: MouseEvent) {
    event.stopPropagation();
    onRemove?.(index);
  }

  function handleDownload(event: MouseEvent) {
    event.stopPropagation();
    onDownload?.(track);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onpointerenter={() => onHover(track.id)}
  onpointerleave={() => onHoverEnd(track.id)}
  draggable="true"
  ondragstart={(e) => onDragStart?.(e, index)}
  ondragover={(e) => onDragOver?.(e, index)}
  ondrop={(e) => onDrop?.(e, index)}
  ondragend={onDragEnd}
  onclick={() => onSelect?.(index)}
  class={cn(
    "group flex items-center justify-between gap-3 px-1 py-2 rounded-lg cursor-pointer select-none transition-colors text-sm",
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
      <div class="flex items-center gap-1.5 min-w-0">
        <span class={cn("truncate font-medium", isActive && "text-primary")}>
          {displayTitle}
        </span>
        {#if isAutoDjAnchor}
          <span
            title="AutoDJ Anchor Track"
            class="shrink-0 flex items-center text-primary/70"
          >
            <Disc3 class="size-3.5" />
          </span>
        {/if}
      </div>
      <span class="truncate min-h-3 text-xs text-muted-foreground">
        {displayArtist}
      </span>
    </div>
  </div>

  <div class="flex items-center justify-between gap-3 shrink-0">
    {#if track.source}
      <div class="hidden group-hover:flex items-center">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Download ${displayTitle}`}
          title="Download"
          onclick={handleDownload}
          class="size-4.5 p-0 text-muted-foreground hover:text-secondary-foreground hover:bg-destructive/10"
        >
          <Download class="size-3.5" />
        </Button>
      </div>
    {/if}
    <span class="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
      {formatTime(track.duration ?? 0)}
    </span>
  </div>
</div>
