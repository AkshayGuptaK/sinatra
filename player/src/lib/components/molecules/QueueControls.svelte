<!-- src/lib/components/molecules/QueueControls.svelte -->
<script lang="ts">
  import ToggleButton from "$lib/components/atoms/ToggleButton.svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    SkipBack,
    SkipForward,
    Shuffle,
    Repeat,
    CircleX,
    Disc3,
  } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  interface Props {
    isAutoDj?: boolean;
    isShuffle?: boolean;
    isRepeatAll?: boolean;
    hasPrevious?: boolean;
    hasNext?: boolean;
    disabled?: boolean;
    class?: string;
    onPrevious?: () => void;
    onNext?: () => void;
    onAutoDjToggle?: (nextAutoDj: boolean) => void;
    onShuffleToggle?: (nextShuffle: boolean) => void;
    onRepeatAllToggle?: (nextRepeat: boolean) => void;
    onClearQueue?: () => void;
  }

  let {
    isAutoDj = false,
    isShuffle = false,
    isRepeatAll = false,
    hasPrevious = false,
    hasNext = false,
    disabled = false,
    class: className = "",
    onPrevious,
    onNext,
    onAutoDjToggle,
    onShuffleToggle,
    onRepeatAllToggle,
    onClearQueue,
  }: Props = $props();
</script>

<div
  class={cn(
    "flex items-center justify-between px-3 py-3 border-t bg-muted/10 select-none",
    className
  )}
>
  <div class="flex items-center gap-1">
    <!-- Play Order Actions (Shuffling / Looping) -->
    <ToggleButton
    active={isAutoDj}
    inactiveIcon={Disc3}
    activeIcon={Disc3}
    inactiveLabel="Enable auto DJ"
    activeLabel="Disable auto DJ"
    inactiveVariant="ghost"
    activeVariant="secondary"
    size="icon"
    {disabled}
    iconClass="size-4"
    class={cn(
      "size-8 transition-colors",
      isAutoDj
        ? "text-primary font-medium"
        : "text-muted-foreground hover:text-foreground"
    )}
    onToggle={(next) => onAutoDjToggle?.(next)}
  />

    <ToggleButton
      active={isShuffle}
      inactiveIcon={Shuffle}
      activeIcon={Shuffle}
      inactiveLabel="Enable shuffle"
      activeLabel="Disable shuffle"
      inactiveVariant="ghost"
      activeVariant="secondary"
      size="icon"
      {disabled}
      iconClass="size-4"
      class={cn(
        "size-8 transition-colors",
        isShuffle
          ? "text-primary font-medium"
          : "text-muted-foreground hover:text-foreground"
      )}
      onToggle={(next) => onShuffleToggle?.(next)}
    />

    <ToggleButton
      active={isRepeatAll}
      inactiveIcon={Repeat}
      activeIcon={Repeat}
      inactiveLabel="Enable repeat all"
      activeLabel="Disable repeat all"
      inactiveVariant="ghost"
      activeVariant="secondary"
      size="icon"
      {disabled}
      iconClass="size-4"
      class={cn(
        "size-8 transition-colors",
        isRepeatAll
          ? "text-primary font-medium"
          : "text-muted-foreground hover:text-foreground"
      )}
      onToggle={(next) => onRepeatAllToggle?.(next)}
    />
  </div>

  <!-- Track Skipping Actions (Previous / Next) -->
  <div class="flex items-center gap-1">
    <Button
      variant="ghost"
      size="icon"
      aria-label="Play previous track"
      title="Previous track"
      disabled={disabled || !hasPrevious}
      onclick={onPrevious}
      class="size-8 text-muted-foreground hover:text-foreground"
    >
      <SkipBack class="size-4" />
    </Button>

    <Button
      variant="ghost"
      size="icon"
      aria-label="Play next track"
      title="Next track"
      disabled={disabled || !hasNext}
      onclick={onNext}
      class="size-8 text-muted-foreground hover:text-foreground"
    >
      <SkipForward class="size-4" />
    </Button>
  </div>

  <!-- Clear Queue -->
  <Button
    variant="ghost"
    size="icon"
    aria-label="Clear queue"
    title="Clear queue"
    {disabled}
    onclick={onClearQueue}
    class="size-8 text-muted-foreground hover:text-destructive transition-colors"
  >
    <CircleX class="size-4" />
  </Button>
</div>
