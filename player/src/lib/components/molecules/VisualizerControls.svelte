<script lang="ts">
  import { Timeline, Bubbles } from "@lucide/svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import { cn } from "$lib/utils";

  export type VisualizerViewMode = "timeline" | "fluid";

  interface Props {
    viewMode?: VisualizerViewMode;
    onViewChange?: (mode: VisualizerViewMode) => void;
    class?: string;
  }

  let {
    viewMode = "timeline",
    onViewChange,
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
</div>
