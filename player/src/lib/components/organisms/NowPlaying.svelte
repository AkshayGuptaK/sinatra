<script lang="ts">
  import TrackDetails from "../molecules/TrackDetails.svelte";
  import PlayControls from "$lib/components/molecules/PlayControls.svelte";
  import TrackProgress from "$lib/components/molecules/TrackProgress.svelte";
  import VolumeControl from "$lib/components/molecules/VolumeControl.svelte";
  import MiniBarVisualizer from "$lib/components/atoms/MiniBarVisualizer.svelte";
  import { player } from "$lib/core/player.svelte";
  import { cn } from "$lib/utils";
  import {
    getTrackDisplayAttribution,
    getTrackDisplayTitle,
  } from "$lib/utils/display";

  interface Props {
    class?: string;
    onTrackClick?: () => void;
  }

  let { class: className = "", onTrackClick }: Props = $props();

  let currentTitle = $derived(getTrackDisplayTitle(player.currentTrack));
  let currentArtist = $derived(getTrackDisplayAttribution(player.currentTrack));

  let volume = $state(1);

  async function handlePlayToggle() {
    if (!player.currentTrackId) {
      return;
    } else {
      player.engine.togglePlay();
    }
  }

  function handleLoopToggle() {
    player.setLoopMode(player.loopMode === "one" ? "none" : "one");
  }

  function handleVolumeChange(nextVol: number) {
    volume = nextVol;
    player.engine.setVolume(nextVol);
  }
</script>

<div
  class={cn(
    "flex flex-col md:flex-row items-center gap-6 w-full p-3 md:px-6 md:py-3 rounded-xl border bg-card text-card-foreground shadow-lg",
    className
  )}
>
  <button
    type="button"
    onclick={onTrackClick}
    class="group flex items-center text-left bg-transparent border-0 p-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
    title="Toggle between Curate and Vibe views"
  >
    <TrackDetails {currentTitle} {currentArtist} />
  </button>

  <div class="flex flex-1 flex-col items-center gap-2 w-full">
    <div class="grid grid-cols-[1fr_auto_1fr] items-center w-full">
      <div class="col-start-2 flex items-center gap-8">
        <PlayControls
          isPlaying={player.engine.isPlaying}
          isLooping={player.loopMode === "one"}
          onPlayToggle={handlePlayToggle}
          onSkipBackward={() => player.engine.seekRelative(-5)}
          onSkipForward={() => player.engine.seekRelative(5)}
          onLoopToggle={handleLoopToggle}
          disabled={!player.currentTrackId}
        />

        <VolumeControl
          {volume}
          setVolume={handleVolumeChange}
          disabled={!player.currentTrackId}
        />
      </div>
      <div class="col-start-3 flex justify-end px-4">
        <MiniBarVisualizer isPlaying={player.engine.isPlaying} bars={10} />
      </div>
    </div>

    <TrackProgress
      currentTime={player.engine.currentTime}
      duration={player.engine.duration}
      disabled={!player.currentTrackId}
      onSeek={(time) => player.engine.seekTo(time)}
    />
  </div>
</div>
