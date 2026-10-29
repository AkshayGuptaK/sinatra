<!-- src/lib/components/organisms/Visualizer.svelte -->
<script lang="ts">
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import VisualizerTimelineView from "$lib/components/organisms/VisualizerTimelineView.svelte";
  import VisualizerFluidView from "$lib/components/organisms/VisualizerFluidView.svelte";
  import VisualizerControls, {
    type VisualizerViewMode,
  } from "$lib/components/molecules/VisualizerControls.svelte";
  import { View, Settings } from "@lucide/svelte";
  import { player } from "$lib/core/player.svelte";
  import { cn } from "$lib/utils";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import {
    handleCommandSubmit,
    handleSearchChange,
  } from "$lib/core/command.svelte";
  import { EMOTION_MAP } from "$lib/core/emotions.svelte";

  interface Props {
    class?: string;
    openSettings?: () => void;
  }

  let { class: className = "", openSettings }: Props = $props();

  let viewMode = $state<VisualizerViewMode>("timeline");
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
      <VisualizerControls
        canSplit={player.engine.canSplitSegment}
        canPush={player.engine.canPushSegment}
        canPull={player.engine.canPullSegment}
        isEditing={player.engine.isEditingSegments}
        onSplit={player.engine.splitSegmentAtCurrentTime}
        onPush={player.engine.pushSegmentToCurrentTime}
        onPull={player.engine.pullSegmentToCurrentTime}
        {viewMode}
        onViewChange={(mode) => (viewMode = mode)}
      />
    </div>
  </div>

  <!-- Stage Canvas Body -->
  <div class="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
    {#if viewMode === "timeline"}
      <div class="w-full h-full overflow-y-auto">
        <VisualizerTimelineView
          segments={player.engine.segments}
          duration={player.engine.duration}
          currentTime={player.engine.currentTime}
          isPlaying={player.engine.isPlaying}
          onSeek={(sec) => player.engine.seekTo(sec)}
          rms={player.currentTrack?.rms_env}
          emotions={player.currentTrack &&
            EMOTION_MAP["audio_emotion"]["getEmotions"](player.currentTrack)}
        />
      </div>
    {:else}
      <VisualizerFluidView
        segments={player.engine.segments}
        duration={player.engine.duration}
        currentTime={player.engine.currentTime}
        isPlaying={player.engine.isPlaying}
        rms={player.currentTrack?.rms_env}
        getDspMetrics={() => player.engine.dsp.getVisualizerMetrics()}
        class="w-full h-full"
      />
    {/if}
  </div>
</div>
