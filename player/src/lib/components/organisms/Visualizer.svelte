<script lang="ts">
  import { cn } from "$lib/utils";
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import VisualizerTimelineView from "$lib/components/organisms/VisualizerTimelineView.svelte";
  import VisualizerFluidView from "$lib/components/organisms/VisualizerFluidView.svelte";
  import VisualizerControls from "$lib/components/molecules/VisualizerControls.svelte";
  import TimelineControls from "$lib/components/molecules/TimelineControls.svelte";
  import { View } from "@lucide/svelte";
  import { player } from "$lib/core/player.svelte";
  import { settings } from "$lib/core/settings.svelte";
  import { EMOTION_MAP } from "$lib/core/emotions.svelte";
  import { ui } from "$lib/stores/ui.svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <HeaderBanner title="Visualizer" icon={View} />
  <div class="flex flex-col w-full gap-3 shrink-0">
    <div
      class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2"
    >
      <CommandBar />
      <div class="flex gap-2">
        {#if ui.visualizerView === "timeline"}
          <TimelineControls
            canSplit={player.engine.canSplitSegment}
            canPush={player.engine.canPushSegment}
            canPull={player.engine.canPullSegment}
            isEditing={player.engine.isEditingSegments}
            onSplit={player.engine.splitSegmentAtCurrentTime}
            onPush={player.engine.pushSegmentToCurrentTime}
            onPull={player.engine.pullSegmentToCurrentTime}
          />
        {/if}

        <VisualizerControls
          viewMode={ui.visualizerView}
          onViewChange={ui.setVisualizerView}
          isLyricsOpen={ui.isLyricsOpen}
          onToggleLyrics={ui.toggleLyrics}
        />
      </div>
    </div>
  </div>

  <!-- Stage Canvas Body -->
  <div class="flex-1 min-h-0 w-full overflow-hidden flex flex-col">
    {#if ui.visualizerView === "timeline"}
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
        qualityPreset={settings.get("visualizer.performance")}
        stylePreset={settings.get("visualizer.style")}
        getDspMetrics={() => player.engine.dsp.getVisualizerMetrics()}
        class="w-full h-full"
      />
    {/if}
  </div>
</div>
