<script lang="ts">
  import LibraryTrackItem from "$lib/components/molecules/LibraryListTrackItem.svelte";
  import InfiniteScrollList from "$lib/components/molecules/InfiniteScrollList.svelte";
  import * as Popover from "$lib/components/ui/popover";
  import TagEditorPopover from "$lib/components/molecules/TagEditorPopover.svelte";
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

  // Single shared Popover state
  let activeTaggingTrack = $state<Track | null>(null);
  let isPopoverOpen = $state(false);
  let triggerAnchorEl = $state<HTMLElement | null>(null);

  function handleOpenTagEditor(track: Track, triggerEl: HTMLElement) {
    activeTaggingTrack = track;
    triggerAnchorEl = triggerEl;
    isPopoverOpen = true;
  }

  function handlePopoverClose(open: boolean) {
    isPopoverOpen = open;
    if (!open) {
      activeTaggingTrack = null;
      triggerAnchorEl = null;
    }
  }

  $effect(() => {
    if (activeTaggingTrack && isPopoverOpen) {
      const exists = library.displayedTracks.some(
        (t) => t.id === activeTaggingTrack?.id
      );
      if (!exists) {
        handlePopoverClose(false);
      }
    }
  });

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

  function handleDequeue(track: Track) {
    player.removeTrackById(track.id);
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
    <ColumnHeaderCell
      label="Tags"
      sortDirection={getSortDirection("tags")}
      onToggleSort={() => handleSort("tags")}
    />
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
            matchedLyrics={library.lyricMatches.get(track.id) ?? []}
            isActive={player.currentTrackId === track.id}
            isPlaying={player.currentTrackId === track.id &&
              player.engine.isPlaying}
            isQueued={queuedTrackIds.has(track.id)}
            onPlay={handlePlay}
            onEnqueue={handleEnqueue}
            onDequeue={handleDequeue}
            onUpdate={(fields) => library.updateTrackMetadata(track.id, fields)}
            activeTaggingTrackId={activeTaggingTrack?.id}
            onOpenTagEditor={handleOpenTagEditor}
          />
        {/snippet}
      </InfiniteScrollList>
    {/if}
  </div>

  <Popover.Root open={isPopoverOpen} onOpenChange={handlePopoverClose}>
    <!-- Hidden anchor synced to the clicked row's '+' button -->
    <Popover.Trigger
      bind:ref={triggerAnchorEl}
      tabindex={-1}
      class="hidden"
      aria-hidden="true"
    />

    {#if activeTaggingTrack}
      <TagEditorPopover
        bind:open={isPopoverOpen}
        tags={activeTaggingTrack.tags ?? []}
        trackTitle={activeTaggingTrack.title}
        onOpenChange={handlePopoverClose}
        onChange={(nextTags) => {
          if (activeTaggingTrack) {
            library.updateTrackMetadata(activeTaggingTrack.id, {
              tags: nextTags,
            });
          }
        }}
        suggestTags={() =>
          library.getNewTagSuggestions(activeTaggingTrack!.id)}
      />
    {/if}
  </Popover.Root>
</div>
