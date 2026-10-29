<!-- src/lib/components/organisms/Library.svelte -->
<script lang="ts">
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import VisualizerTimelineView from "./VisualizerTimelineView.svelte";
  import { View, Settings } from "@lucide/svelte";
  import { player } from "$lib/core/player.svelte";
  import { cn } from "$lib/utils";
  import ControlButton from "../atoms/ControlButton.svelte";
  import {
    handleCommandSubmit,
    handleSearchChange,
  } from "$lib/core/command.svelte";

  interface Props {
    class?: string;
    openSettings?: () => void;
  }

  let { class: className = "", openSettings }: Props = $props();
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <HeaderBanner title="Visualizer" icon={View}>
    <ControlButton
      icon={Settings}
      onClick={openSettings}
      label="Open Settings"
      title="Settings (Cmd+,)"
      class="size-4"
      iconClass="size-4"
    />
  </HeaderBanner>
  <div class="flex flex-col w-full gap-3 shrink-0">
    <div
      class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2"
    >
      <CommandBar
        onSearchChange={handleSearchChange}
        onCommandSubmit={handleCommandSubmit}
      />
    </div>
  </div>

  <!-- Canvas Body -->
  <div class="w-full flex flex-col gap-3">
    <VisualizerTimelineView
      segments={player.engine.segments}
      duration={player.engine.duration}
      currentTime={player.engine.currentTime}
      rms={player.engine.currentRmsEnv}
    />
  </div>
</div>
