<!-- src/lib/components/organisms/LibraryListView.svelte -->
<script lang="ts">
  import LibraryTrackItem from "$lib/components/molecules/LibraryListTrackItem.svelte";
  import InfiniteScrollList from "$lib/components/molecules/InfiniteScrollList.svelte";
  import { library } from "$lib/audio/library.svelte";
  import { player } from "$lib/audio/player.svelte";
  import type { Track } from "$lib/types/track";
  import { Clock3 } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  function handlePlay(track: Track) {
    const trackIndex = library.filteredTracks.findIndex(
      (t) => t.id === track.id
    );
    if (trackIndex !== -1) {
      player.setQueue(library.filteredTracks, trackIndex, true);
    }
  }

  function handleEnqueue(track: Track) {
    player.enqueue(track);
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 overflow-hidden",
    className
  )}
>
  <!-- Sticky Header -->
  <div
    class="grid grid-cols-[3rem_minmax(180px,2fr)_minmax(140px,1.5fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_5rem_3.5rem] items-center px-4 py-2.5 border-y bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none"
  >
    <div>#</div>
    <div>Title</div>
    <div>Artist</div>
    <div>Album</div>
    <div>Mood</div>
    <div class="flex justify-end pr-2"><Clock3 class="size-3.5" /></div>
    <div></div>
  </div>

  <!-- Progressively Rendered Rows -->
  <div class="flex-1 min-h-0 flex flex-col">
    {#if library.isLoading}
      <div
        class="flex items-center justify-center h-48 text-sm text-muted-foreground"
      >
        Loading library...
      </div>
    {:else if library.filteredTracks.length === 0}
      <div
        class="flex items-center justify-center h-48 text-sm text-muted-foreground"
      >
        No tracks found.
      </div>
    {:else}
      <InfiniteScrollList items={library.filteredTracks} batchSize={100} class="h-full">
        {#snippet children(track, index)}
          <LibraryTrackItem
            {track}
            {index}
            isActive={player.currentTrackId === track.id}
            isPlaying={player.currentTrackId === track.id &&
              player.engine.isPlaying}
            onPlay={handlePlay}
            onEnqueue={handleEnqueue}
          />
        {/snippet}
      </InfiniteScrollList>
    {/if}
  </div>
</div>
