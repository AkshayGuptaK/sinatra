<script lang="ts">
  import { Mic, Timeline, Bubbles } from "@lucide/svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import { cn } from "$lib/utils";
  import ToggleButton from "../atoms/ToggleButton.svelte";
  import type { VisualizerViewMode } from "$lib/stores/ui.svelte";

  interface Props {
    viewMode?: VisualizerViewMode;
    onViewChange?: (mode: VisualizerViewMode) => void;
    isLyricsOpen?: boolean;
    onToggleLyrics?: () => void;
    class?: string;
  }

  let {
    viewMode = "timeline",
    onViewChange,
    isLyricsOpen = false,
    onToggleLyrics,
    class: className = "",
  }: Props = $props();
</script>

<div class={cn("flex items-center gap-1.5 select-none", className)}>
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

  <ToggleButton
    active={isLyricsOpen}
    inactiveIcon={Mic}
    activeIcon={Mic}
    inactiveLabel="Show lyrics"
    activeLabel="Hide lyrics"
    inactiveVariant="ghost"
    activeVariant="secondary"
    size="icon"
    iconClass="size-4"
    activeClass="size-8 text-primary font-medium bg-muted/60"
    inactiveClass="size-8 text-muted-foreground hover:text-foreground"
    onToggle={() => onToggleLyrics?.()}
  />
</div>
