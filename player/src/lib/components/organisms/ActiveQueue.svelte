<!-- src/lib/components/organisms/ActiveQueue.svelte -->
<script lang="ts">
  import QueueTrackItem from "$lib/components/molecules/QueueTrackItem.svelte";
  import QueueDurationSummary from "$lib/components/molecules/QueueDurationSummary.svelte";
  import QueueControls from "$lib/components/molecules/QueueControls.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { cn } from "$lib/utils";
  import { ListMusic } from "@lucide/svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  // Cumulative duration of all tracks in the queue
  let totalDuration = $derived(
    player.queue.reduce((acc, track) => acc + (track.duration ?? 0), 0)
  );

  // Elapsed duration: sum of finished tracks + current playing track's elapsed seconds
  let elapsedDuration = $derived.by(() => {
    if (player.currentIndex < 0 || player.queue.length === 0) return 0;

    const completedTracksDuration = player.queue
      .slice(0, player.currentIndex)
      .reduce((acc, track) => acc + (track.duration ?? 0), 0);

    return completedTracksDuration + player.engine.currentTime;
  });

  function handleTrackSelect(index: number) {
    player.playTrackAtIndex(index);
  }

  function handleRepeatAllToggle() {
    player.setLoopMode(player.loopMode === "all" ? "none" : "all");
  }

  function handleTrackRemove(index: number) {
    player.removeTrackAtIndex(index);
  }
</script>

<div
  class={cn(
    "flex flex-col w-full max-w-md h-full rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <!-- Header / Queue Context Title -->
  <div
    class="flex items-center gap-2 px-4 py-3 border-b bg-muted/20 select-none"
  >
    <ListMusic class="size-4 text-muted-foreground" />
    <h2
      class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      Queue
    </h2>
  </div>

  <!-- Track List Container -->
  <div class="flex-1 overflow-y-auto p-2 space-y-0.5">
    {#if player.queue.length === 0}
      <div
        class="flex flex-col items-center justify-center h-full text-center p-4"
      >
        <p class="text-xs text-muted-foreground">Queue is currently empty.</p>
      </div>
    {:else}
      {#each player.queue as track, index (track.id + index)}
        <QueueTrackItem
          {track}
          {index}
          isActive={index === player.currentIndex}
          isPlaying={index === player.currentIndex && player.engine.isPlaying}
          onSelect={handleTrackSelect}
          onRemove={handleTrackRemove}
        />
      {/each}
    {/if}
  </div>

  <!-- Sticky Queue Summary Footer -->
  <QueueDurationSummary
    trackCount={player.queue.length}
    {totalDuration}
    {elapsedDuration}
  />

  <!-- Queue Controls Footer -->
  <QueueControls
    isAutoDj={player.isAutoDj}
    isShuffle={player.isShuffle}
    isRepeatAll={player.loopMode === "all"}
    hasPrevious={player.hasPrevious}
    hasNext={player.hasNext}
    disabled={player.queue.length === 0}
    onPrevious={() => player.previous()}
    onNext={() => player.next()}
    onAutoDjToggle={() => player.toggleAutoDj()}
    onShuffleToggle={() => player.toggleShuffle()}
    onRepeatAllToggle={handleRepeatAllToggle}
    onClearQueue={() => player.clearQueue()}
  />
</div>
