<!-- src/lib/components/molecules/QueueControls.svelte -->
<script lang="ts">
  import { cn } from "$lib/utils";
  import type { FilterIntent } from "$lib/utils/commandParser";
  import type { SimilarityMode } from "$lib/api/sinatra";
  import * as Popover from "$lib/components/ui/popover";
  import ToggleButton from "$lib/components/atoms/ToggleButton.svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import { formatTime } from "$lib/utils/time";
  import {
    SkipBack,
    SkipForward,
    Shuffle,
    Repeat,
    CircleX,
    Disc3,
    X,
    AudioWaveform,
    HeartHandshake,
    ChevronDown,
    Check,
  } from "@lucide/svelte";

  interface Props {
    isAutoDj?: boolean;
    autoDjMode?: SimilarityMode;
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
    onAutoDjModeSelect?: (mode: SimilarityMode) => void;
    onClearAutoDjConstraint: () => void;
    onShuffleToggle: (nextShuffle: boolean) => void;
    onRepeatAllToggle: (nextRepeat: boolean) => void;
    onClearQueue: () => void;
  }

  let {
    isAutoDj = false,
    autoDjMode = "acoustics",
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
    onAutoDjModeSelect,
    onClearAutoDjConstraint,
    onShuffleToggle,
    onRepeatAllToggle,
    onClearQueue,
  }: Props = $props();

  let isModePopoverOpen = $state(false);

  function getConstraintLabel(filter: FilterIntent): string {
    switch (filter.type) {
      case "column_filter":
        return `:${filter.column} ${filter.query}`;
      case "duration_filter":
        return `:duration ${filter.operator} ${formatTime(filter.seconds)}`;
      case "lyrics_filter":
        return `:lyrics ${filter.query}`;
      case "text_search":
        return `"${filter.query}"`;
      case "queued_filter":
        return `:q ${getConstraintLabel(filter.filter)}`;
    }
  }

  function handleSelectMode(mode: SimilarityMode) {
    onAutoDjModeSelect?.(mode);
    isModePopoverOpen = false;
  }
</script>

<div
  class={cn(
    "flex items-center justify-between px-3 py-3 border-t bg-muted/10 select-none",
    className
  )}
>
  <div class="flex items-center gap-1.5">
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
      inactiveClass="size-8 text-muted-foreground"
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
      inactiveClass="size-8 text-muted-foreground"
      onToggle={(next) => onRepeatAllToggle?.(next)}
    />

    <!-- Pattern 1: AutoDJ Split Pill with shadcn Popover -->
    <div
      class={cn(
        "inline-flex items-center h-8 rounded-lg border text-xs transition-colors",
        isAutoDj
          ? "bg-secondary text-primary border-primary/30 font-medium"
          : "bg-transparent text-muted-foreground border-transparent hover:bg-muted/50"
      )}
    >
      <!-- AutoDJ Enable/Disable Toggle Segment -->
      <ToggleButton
        active={isAutoDj}
        inactiveIcon={Disc3}
        activeIcon={Disc3}
        inactiveLabel="Enable auto DJ"
        activeLabel="Disable auto DJ"
        inactiveVariant="ghost"
        activeVariant="ghost"
        size="sm"
        {disabled}
        iconClass={cn("size-4", isAutoDj && "animate-spin-slow")}
        activeClass="h-full px-2 rounded-l-lg rounded-r-none text-primary hover:bg-transparent"
        inactiveClass="h-full px-2 rounded-l-lg rounded-r-none text-muted-foreground hover:bg-transparent"
        onToggle={(next) => onAutoDjToggle?.(next)}
      >
        {#snippet child({ active }: { active: boolean })}
          <div class="flex items-center gap-1.5">
            <Disc3 class={cn("size-4", active && "animate-spin-slow")} />
          </div>
        {/snippet}
      </ToggleButton>

      <!-- Similarity Mode Popover Trigger Segment -->
      <Popover.Root bind:open={isModePopoverOpen}>
        <Popover.Trigger>
          {#snippet child({ props })}
            <button
              {...props}
              type="button"
              class={cn(
                "flex items-center gap-1 px-1.5 h-full rounded-r-lg border-l transition-colors cursor-pointer hover:text-secondary-foreground",
                isAutoDj
                  ? "border-primary/20"
                  : "border-border/60 hover:bg-muted/50"
              )}
              title={`Similarity mode: ${autoDjMode}`}
              aria-label="Change AutoDJ similarity mode"
              {disabled}
            >
              {#if autoDjMode === "emotion"}
                <HeartHandshake class="size-3.5" />
              {:else}
                <AudioWaveform class="size-3.5" />
              {/if}
              <ChevronDown class="size-2.5 opacity-60" />
            </button>
          {/snippet}
        </Popover.Trigger>

        <!-- Drop-up positioned above the transport/controls row -->
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          class="w-44 p-1 gap-1 rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-xl z-50 text-xs select-none"
        >
          <div
            class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
          >
            Similarity Metric
          </div>

          <button
            type="button"
            onclick={() => handleSelectMode("acoustics")}
            class={cn(
              "w-full flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors text-left hover:text-secondary-foreground",
              autoDjMode === "acoustics"
                ? "bg-muted/50 text-primary font-medium"
                : "text-foreground"
            )}
          >
            <div class="flex items-center gap-2">
              <AudioWaveform class="size-3.5" />
              <span>Acoustics</span>
            </div>
            {#if autoDjMode === "acoustics"}
              <Check class="size-3 text-primary" />
            {/if}
          </button>

          <button
            type="button"
            onclick={() => handleSelectMode("emotion")}
            class={cn(
              "w-full flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer transition-colors text-left hover:text-secondary-foreground",
              autoDjMode === "emotion"
                ? "bg-muted/50 text-primary font-medium"
                : "text-foreground"
            )}
          >
            <div class="flex items-center gap-2">
              <HeartHandshake class="size-3.5" />
              <span>Emotion</span>
            </div>
            {#if autoDjMode === "emotion"}
              <Check class="size-3 text-primary" />
            {/if}
          </button>
        </Popover.Content>
      </Popover.Root>
    </div>

    <!-- Active AutoDJ Constraint Badge -->
    {#if autoDjConstraint}
      <div
        class="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-xs font-medium bg-primary/10 border border-primary/25 text-primary select-none animate-in fade-in zoom-in-95 duration-100"
      >
        <span
          class="truncate max-w-[110px] font-mono text-[11px] leading-tight"
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
    />

    <ControlButton
      icon={SkipForward}
      label="Play next track"
      title="Next track"
      disabled={disabled || !hasNext}
      onClick={onNext}
      class="size-8"
      iconClass="size-4"
    />

    <ControlButton
      icon={CircleX}
      label="Clear queue"
      title="Clear queue"
      {disabled}
      onClick={onClearQueue}
      class="size-8 hover:text-destructive"
      iconClass="size-4"
    />
  </div>
</div>
