<!-- src/lib/components/molecules/QueueControls.svelte -->
<script lang="ts">
  import { cn } from "$lib/utils";
  import type { FilterIntent } from "$lib/utils/commandParser";
  import {
    SkipBack,
    SkipForward,
    Shuffle,
    Repeat,
    CircleX,
    Disc3,
    X,
  } from "@lucide/svelte";
  import ToggleButton from "$lib/components/atoms/ToggleButton.svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";

  interface Props {
    isAutoDj?: boolean;
    autoDjConstraint?: FilterIntent | null;
    isShuffle?: boolean;
    isRepeatAll?: boolean;
    hasPrevious?: boolean;
    hasNext?: boolean;
    disabled?: boolean;
    class?: string;
    onPrevious: () => void;
    onNext: () => void;
    onAutoDjToggle: (nextAutoDj: boolean) => void;
    onClearAutoDjConstraint: () => void;
    onShuffleToggle: (nextShuffle: boolean) => void;
    onRepeatAllToggle: (nextRepeat: boolean) => void;
    onClearQueue: () => void;
  }

  let {
    isAutoDj = false,
    autoDjConstraint = null,
    isShuffle = false,
    isRepeatAll = false,
    hasPrevious = false,
    hasNext = false,
    disabled = false,
    class: className = "",
    onPrevious,
    onNext,
    onAutoDjToggle,
    onClearAutoDjConstraint,
    onShuffleToggle,
    onRepeatAllToggle,
    onClearQueue,
  }: Props = $props();

  function getConstraintLabel(filter: FilterIntent): string {
    switch (filter.type) {
      case "column_filter":
        return `:${filter.column} ${filter.query}`;
      case "text_search":
        return `"${filter.query}"`;
      case "queued_filter":
        return `:q ${getConstraintLabel(filter.filter)}`;
    }
  }
</script>

<div
  class={cn(
    "flex items-center justify-between px-3 py-3 border-t bg-muted/10 select-none",
    className
  )}
>
  <div class="flex items-center gap-1">
    <!-- Play Order Actions -->
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
      activeClass="size-8 text-primary font-medium"
      inactiveClass="size-8 text-muted-foreground "
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
      activeClass="size-8 text-primary font-medium"
      inactiveClass="size-8 text-muted-foreground "
      onToggle={(next) => onRepeatAllToggle?.(next)}
    />

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
      activeClass="size-8 text-primary font-medium"
      inactiveClass="size-8 text-muted-foreground "
      onToggle={(next) => onAutoDjToggle?.(next)}
    />

    {#if autoDjConstraint}
      <div
        class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium bg-primary/10 border border-primary/25 text-primary select-none animate-in fade-in zoom-in-95 duration-100"
      >
        <span
          class="truncate max-w-[130px] font-mono text-[11px] leading-tight"
        >
          {getConstraintLabel(autoDjConstraint)}
        </span>

        <button
          type="button"
          onclick={(e) => {
            e.stopPropagation();
            onClearAutoDjConstraint();
          }}
          class="flex items-center justify-center size-3.5 rounded-full hover:bg-primary/20 hover:text-destructive transition-colors cursor-pointer"
          title="Clear AutoDJ constraint"
          aria-label="Clear AutoDJ constraint"
        >
          <X class="size-2.5" />
        </button>
      </div>
    {/if}
  </div>

  <!-- Track Skipping Actions -->
  <div class="flex items-center gap-1">
    <ControlButton
      icon={SkipBack}
      label="Play previous track"
      title="Previous track"
      disabled={disabled || !hasPrevious}
      onClick={onPrevious}
      class="size-8"
      iconClass="size-4"
    ></ControlButton>

    <ControlButton
      icon={SkipForward}
      label="Play next track"
      title="Next track"
      disabled={disabled || !hasNext}
      onClick={onNext}
      class="size-8"
      iconClass="size-4"
    ></ControlButton>

    <ControlButton
      icon={CircleX}
      label="Clear queue"
      title="Clear queue"
      {disabled}
      onClick={onClearQueue}
      class="size-8 hover:text-destructive"
      iconClass="size-4"
    ></ControlButton>
  </div>
</div>
