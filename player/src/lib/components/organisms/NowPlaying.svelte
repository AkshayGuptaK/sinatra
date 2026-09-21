<script lang="ts">
  import PlayControls from "$lib/components/molecules/PlayControls.svelte";
  import TrackProgress from "$lib/components/molecules/TrackProgress.svelte";
  import VolumeControl from "$lib/components/molecules/VolumeControl.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { cn } from "$lib/utils";

  interface Props {
    title?: string;
    artist?: string;
    class?: string;
  }

  let {
    title = "Unknown",
    artist = "Unknown",
    class: className = "",
  }: Props = $props();

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
    "flex flex-col md:flex-row items-center justify-between gap-6 w-full max-w-4xl p-4 md:px-6 md:py-4 rounded-xl border bg-card text-card-foreground shadow-lg",
    className
  )}
>
  <!-- Track Details -->
  <div
    class="flex flex-col min-w-0 w-full md:w-56 text-center md:text-left select-none"
  >
    <span
      class="truncate text-base font-semibold tracking-tight text-foreground"
      {title}
    >
      {title}
    </span>
    <span
      class="truncate text-xs font-medium text-muted-foreground"
      title={artist}
    >
      {artist}
    </span>
  </div>

  <!-- Center / Right Container: Controls & Scrub Bar -->
  <div class="flex flex-1 flex-col items-center gap-2 w-full max-w-xl">
    <!-- Transport Controls -->
    <div class="flex items-center gap-4">
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
