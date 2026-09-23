<script lang="ts">
  import { type Track } from "$lib/types/track";
  import { formatTime } from "$lib/utils/time";
  import { Volume2, X, GripVertical } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";

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

  let displayTitle = $derived(track.title || "Unknown Title");
  let displayArtist = $derived(track.artist || "Unknown Artist");

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
  ondragover={(e) => { console.log("draggy"); onDragOver?.(e, index);}}
  ondrop={(e) => onDrop?.(e, index)}
  ondragend={onDragEnd}
  onclick={() => onSelect?.(index)}
  class={cn(
    "group flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors text-sm",
    isActive
      ? "bg-accent/70 text-accent-foreground font-medium"
      : "hover:bg-muted/50 text-foreground",
    className
  )}
>
  <!-- Playing Indicator -->
  <div class="flex items-center gap-2 min-w-0">
    <div
      class="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      title="Drag to reorder"
    >
      <GripVertical class="size-3.5" />
    </div>
    <div class="relative flex items-center justify-center size-6 shrink-0">
      <span class="font-mono text-xs text-muted-foreground group-hover:hidden">
        {#if isActive && isPlaying}
          <Volume2 class="size-4 animate-pulse text-primary inline-block" />
        {/if}
      </span>

      <!-- Remove From Queue Button -->
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${displayTitle} from queue`}
        title="Remove from queue"
        onclick={handleRemove}
        class="hidden group-hover:flex size-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
      >
        <X class="size-3.5" />
      </Button>
    </div>

    <!-- Title & Artist -->
    <div class="flex flex-col min-w-0">
      <span class={cn("truncate font-medium", isActive && "text-primary")}>
        {displayTitle}
      </span>
      <span class="truncate text-xs text-muted-foreground">
        {displayArtist}
      </span>
    </div>
  </div>

  <!-- Track Duration -->
  <span class="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
    {formatTime(track.duration ?? 0)}
  </span>
</div>
