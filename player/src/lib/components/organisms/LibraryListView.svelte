<script lang="ts">
  import LibraryTrackItem from "$lib/components/molecules/LibraryListTrackItem.svelte";
  import InfiniteScrollList from "$lib/components/molecules/InfiniteScrollList.svelte";
  import { library } from "$lib/audio/library.svelte";
  import { player } from "$lib/audio/player.svelte";
  import type { Track } from "$lib/types/track";
  import { Clock3 } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import ColumnHeaderCell from "../atoms/ColumnHeaderCell.svelte";
  import type { SortableField, SortDirection } from "$lib/types/metadata";

  interface Props {
    queuedTrackIds: Set<string>;
    class?: string;
  }

  let { queuedTrackIds, class: className = "" }: Props = $props();

  function handlePlay(track: Track) {
    const trackIndex = library.displayedTracks.findIndex(
      (t) => t.id === track.id
    );
    if (trackIndex !== -1) {
      player.setQueue(library.displayedTracks, trackIndex, true);
    }
  }

  function handleEnqueue(track: Track) {
    player.enqueue(track);
  }

  function getSortDirection(col: SortableField): SortDirection {
    return library.sortColumn === col ? library.sortDirection : null;
  }

  function handleSort(col: SortableField) {
    library.toggleSort(col);
  }
</script>

<div
  class={cn("flex flex-col w-full h-full min-h-0 overflow-hidden", className)}
>
  <!-- Sticky Header -->
  <div
    class="grid grid-cols-[1.5rem_minmax(160px,2fr)_minmax(120px,1.5fr)_minmax(120px,1.5fr)_minmax(80px,0.6fr)_minmax(120px,1.5fr)_5rem_3.5rem] items-center px-4 py-2.5 border-y bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none"
  >
    <div></div>
    <ColumnHeaderCell
      label="Title"
      sortDirection={getSortDirection("title")}
      onToggleSort={() => handleSort("title")}
    />
    <ColumnHeaderCell
      label="Artist"
      sortDirection={getSortDirection("artist")}
      onToggleSort={() => handleSort("artist")}
    />
    <ColumnHeaderCell
      label="Album"
      sortDirection={getSortDirection("album")}
      onToggleSort={() => handleSort("album")}
    />
    <ColumnHeaderCell
      label="Mood"
      sortDirection={getSortDirection("mood")}
      onToggleSort={() => handleSort("mood")}
    />
    <div>Tags</div>
    <div class="flex justify-end pr-2">
      <ColumnHeaderCell
        label="Duration"
        sortDirection={getSortDirection("duration")}
        onToggleSort={() => handleSort("duration")}
      >
        <Clock3 class="size-3.5" />
      </ColumnHeaderCell>
    </div>
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
    {:else if library.displayedTracks.length === 0}
      <div
        class="flex items-center justify-center h-48 text-sm text-muted-foreground"
      >
        No tracks found.
      </div>
    {:else}
      <InfiniteScrollList
        items={library.displayedTracks}
        batchSize={100}
        class="h-full"
      >
        {#snippet children(track, index)}
          <LibraryTrackItem
            {track}
            isActive={player.currentTrackId === track.id}
            isPlaying={player.currentTrackId === track.id &&
              player.engine.isPlaying}
            isQueued={queuedTrackIds.has(track.id)}
            onPlay={handlePlay}
            onEnqueue={handleEnqueue}
            onUpdate={(fields) => library.updateTrackMetadata(track.id, fields)}
          />
        {/snippet}
      </InfiniteScrollList>
    {/if}
  </div>
</div>
