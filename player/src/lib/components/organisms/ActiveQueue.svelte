<!-- src/lib/components/organisms/ActiveQueue.svelte -->
<script lang="ts">
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import QueueTrackItem from "$lib/components/molecules/QueueTrackItem.svelte";
  import QueueDurationSummary from "$lib/components/molecules/QueueDurationSummary.svelte";
  import QueueControls from "$lib/components/molecules/QueueControls.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { library } from "$lib/audio/library.svelte";
  import { cn } from "$lib/utils";
  import { ListMusic } from "@lucide/svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  let draggedIndex = $state<number | null>(null);
  let dropTargetIndex = $state<number | null>(null);

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

  function handleDragStart(e: DragEvent, index: number) {
    draggedIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "move";
    }
    dropTargetIndex = index;
  }

  function handleDrop(e: DragEvent, targetIndex: number) {
    e.preventDefault();
    e.stopPropagation();
    if (draggedIndex !== null && draggedIndex !== targetIndex) {
      player.moveTrack(draggedIndex, targetIndex);
    }
    draggedIndex = null;
    dropTargetIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
    dropTargetIndex = null;
  }
</script>

<div
  class={cn(
    "flex flex-col w-full max-w-md h-full rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <HeaderBanner title="Queue" icon={ListMusic} />
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
          class={cn(
            draggedIndex === index && "opacity-40",
            draggedIndex !== null &&
              dropTargetIndex === index &&
              draggedIndex !== index &&
              (index < draggedIndex
                ? "border-t-2 border-primary"
                : "border-b-2 border-primary")
          )}
          onHover={(trackId: string) => library.setHighlightedTrack(trackId)}
          onHoverEnd={(trackId: string) => {
            if (library.highlightedTrackId === trackId) {
              library.setHighlightedTrack(null);
            }
          }}
          onSelect={handleTrackSelect}
          onRemove={handleTrackRemove}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onDragEnd={handleDragEnd}
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
