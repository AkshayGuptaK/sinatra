<script lang="ts">
  import TrackDetails from "../molecules/TrackDetails.svelte";
  import PlayControls from "$lib/components/molecules/PlayControls.svelte";
  import TrackProgress from "$lib/components/molecules/TrackProgress.svelte";
  import VolumeControl from "$lib/components/molecules/VolumeControl.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { cn } from "$lib/utils";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  let currentTitle = $derived(player.currentTrack ? player.currentTrack.title || "Unknown" : "");
  let currentArtist = $derived(player.currentTrack ? player.currentTrack.artist || player.currentTrack?.album || "Unknown": "");

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
  <!-- Track Details -->
  <TrackDetails {currentTitle} {currentArtist} />

  <!-- Center / Right Container: Controls & Scrub Bar -->
  <div class="flex flex-1 flex-col items-center gap-2 w-full">
    <!-- Transport Controls -->
    <div class="flex items-center gap-8">
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

    <!-- Scrub / Progress Slider -->
    <TrackProgress
      currentTime={player.engine.currentTime}
      duration={player.engine.duration}
      disabled={!player.currentTrackId}
      onSeek={(time) => player.engine.seekTo(time)}
    />
  </div>
</div>
