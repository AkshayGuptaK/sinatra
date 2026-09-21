<script lang="ts">
  import type { Track } from "$lib/types/track";
  import LibraryTrackItem from "$lib/components/molecules/LibraryListTrackItem.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { Clock3 } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  interface Props {
    tracks: Track[];
    class?: string;
    onTrackSelect?: (track: Track) => void;
  }

  let { tracks = [], class: className = "", onTrackSelect }: Props = $props();

  function handleEnqueue(track: Track) {
    player.enqueue(track);
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 bg-card border rounded-xl shadow-sm overflow-hidden",
    className
  )}
>
  <!-- Table Header (Sticky) -->
  <div
    class="grid grid-cols-[1.5rem_minmax(180px,2fr)_minmax(140px,1.5fr)_minmax(140px,1.5fr)_minmax(100px,1fr)_5rem_3.5rem] items-center px-4 py-2.5 border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none"
  >
    <div></div>
    <div>Title</div>
    <div>Artist</div>
    <div>Album</div>
    <div>Mood</div>
    <div class="flex justify-end pr-2">
      <Clock3 class="size-3.5" />
    </div>
    <div class="text-right"></div>
  </div>

  <!-- Scrollable Rows Container -->
  <div class="flex-1 overflow-y-auto divide-y divide-border/20 p-1">
    {#if tracks.length === 0}
      <div
        class="flex flex-col items-center justify-center h-48 text-center p-4"
      >
        <p class="text-sm text-muted-foreground">
          No tracks found in the library.
        </p>
      </div>
    {:else}
      {#each tracks as track, index (track.id)}
        <LibraryTrackItem
          {track}
          {index}
          isActive={player.currentTrackId === track.id}
          isPlaying={player.currentTrackId === track.id &&
            player.engine.isPlaying}
          onEnqueue={handleEnqueue}
        />
      {/each}
    {/if}
  </div>
</div>
