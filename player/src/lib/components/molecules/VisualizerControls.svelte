<script lang="ts">
  import {
    Scissors,
    ArrowRightToLine,
    ArrowLeftToLine,
    Pencil,
    Loader,
    Timeline,
    Bubbles,
  } from "@lucide/svelte";
  import ToggleButton from "$lib/components/atoms/ToggleButton.svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import { cn } from "$lib/utils";

  export type VisualizerViewMode = "timeline" | "fluid";

  interface Props {
    canSplit?: boolean;
    canPush?: boolean;
    canPull?: boolean;
    isEditing?: boolean;
    viewMode?: VisualizerViewMode;
    onViewChange?: (mode: VisualizerViewMode) => void;
    onSplit?: () => void;
    onPush?: () => void;
    onPull?: () => void;
    class?: string;
  }

  let {
    canSplit = false,
    canPush = false,
    canPull = false,
    isEditing = false,
    viewMode = "timeline",
    onViewChange,
    onSplit,
    onPush,
    onPull,
    class: className = "",
  }: Props = $props();

  let isEditMode = $state(false);
</script>

<div class={cn("flex items-center gap-1.5 select-none", className)}>
  {#if isEditMode}
    <!-- Expanded Segment Editing Toolbar -->
    <div
      class="flex items-center gap-1 rounded-lg border border-border/80 bg-muted/30 p-0.5 animate-in fade-in slide-in-from-right-2 duration-150"
    >
      {#if isEditing}
        <div
          class="flex items-center gap-1.5 px-2.5 py-1 text-xs text-primary font-mono"
        >
          <Loader class="size-3.5 animate-spin" />
          <span>Recalculating...</span>
        </div>
      {:else}
        <ControlButton
          icon={ArrowRightToLine}
          label="Push previous split to playhead"
          title="Push previous boundary forward to current playhead"
          disabled={!canPush}
          onClick={() => onPush?.()}
          class="h-7 px-2 text-xs gap-1"
          iconClass="size-3.5"
        />

        <ControlButton
          icon={Scissors}
          label="Split segment at playhead"
          title="Split current segment into two at playhead"
          disabled={!canSplit}
          onClick={() => onSplit?.()}
          class="h-7 px-2 text-xs gap-1"
          iconClass="size-3.5"
        />

        <ControlButton
          icon={ArrowLeftToLine}
          label="Pull next split to playhead"
          title="Pull next boundary backward to current playhead"
          disabled={!canPull}
          onClick={() => onPull?.()}
          class="h-7 px-2 text-xs gap-1"
          iconClass="size-3.5"
        />
      {/if}
    </div>
  {/if}

  <!-- Edit Mode Master Toggle -->
  <ToggleButton
    active={isEditMode}
    inactiveIcon={Pencil}
    activeIcon={Pencil}
    inactiveLabel="Edit segments"
    activeLabel="Done editing segments"
    inactiveVariant="ghost"
    activeVariant="secondary"
    size="icon"
    iconClass="size-4"
    activeClass="size-8 text-primary font-medium"
    inactiveClass="size-8 text-muted-foreground"
    onToggle={(next) => (isEditMode = next)}
  />

  <!-- View Mode Switcher -->
  <div class="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
    <ControlButton
      icon={Timeline}
      onClick={() => onViewChange?.("timeline")}
      label="Switch to Timeline View"
      title="Timeline View"
      class={cn(
        "size-7 p-1 rounded-md",
        viewMode === "timeline"
          ? "bg-background font-medium text-primary shadow-sm hover:text-primary"
          : "text-muted-foreground hover:text-secondary-foreground hover:bg-transparent"
      )}
    ></ControlButton>
    <ControlButton
      icon={Bubbles}
      onClick={() => onViewChange?.("fluid")}
      label="Switch to Visual View"
      title="Visual View"
      class={cn(
        "size-7 p-1 rounded-md",
        viewMode === "fluid"
          ? "bg-background font-medium text-primary shadow-sm hover:text-primary"
          : "text-muted-foreground hover:text-secondary-foreground hover:bg-transparent"
      )}
    ></ControlButton>
  </div>
</div>
