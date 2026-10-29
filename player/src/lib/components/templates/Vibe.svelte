<script lang="ts">
  import NowPlaying from "$lib/components/organisms/NowPlaying.svelte";
  import VisualizerTimelineView from "$lib/components/organisms/VisualizerTimelineView.svelte";
  import { player } from "$lib/core/player.svelte";
  import Visualizer from "../organisms/Visualizer.svelte";

  interface Props {
    openSettings?: () => void;
    onToggleVibe?: () => void;
  }

  let { openSettings, onToggleVibe }: Props = $props();
</script>

<div class="flex h-full w-full flex-col min-w-0 overflow-hidden">
  <main
    class="flex-1 min-h-0 w-full flex flex-col justify-center items-center rounded-xl border bg-card text-card-foreground shadow-xs select-none"
  >
    <Visualizer {openSettings} />
  </main>

  <footer class="w-full shrink-0">
    <NowPlaying class="w-full" onTrackClick={onToggleVibe} />
  </footer>
</div>
