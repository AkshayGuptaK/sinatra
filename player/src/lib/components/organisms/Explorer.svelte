<script lang="ts">
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import ExplorerTrackItem from "$lib/components/molecules/ExplorerTrackItem.svelte";
  import { Compass } from "@lucide/svelte";
  import { explorer } from "$lib/core/explorer.svelte";
  import { player } from "$lib/core/player.svelte";
  import { cn } from "$lib/utils";
  import type { RemoteTrack } from "$lib/api/explore";
  import ExplorerAlbumItem from "../molecules/ExplorerAlbumItem.svelte";
  import ExplorerAlbumDetails from "../molecules/ExplorerAlbumDetails.svelte";
  import ExplorerArtistItem from "../molecules/ExplorerArtistItem.svelte";
  import ExplorerArtistDetails from "../molecules/ExplorerArtistDetails.svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  const queuedTrackIds = $derived(new Set(player.queue.map((t) => t.id)));

  function downloadTrack(track: RemoteTrack) {
    explorer.download(track.video_id);
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <HeaderBanner title="Explorer" icon={Compass} />

  <div
    class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2 bg-muted/10 shrink-0"
  >
    <CommandBar deck="explore" />
    <div
      class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end"
    >
      <!-- controls go here -->
    </div>
  </div>

  <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
    {#if explorer.artists && explorer.artists.length > 0}
      <div class="flex flex-col gap-0.5">
        {#each explorer.artists as artist, index (artist.browse_id + index)}
          <ExplorerArtistItem {artist} browseArtist={explorer.exploreArtist} />
        {/each}
      </div>
    {/if}

    {#if explorer.albums && explorer.albums.length > 0}
      <div class="flex flex-col gap-0.5">
        {#each explorer.albums as album, index (album.browse_id + index)}
          <ExplorerAlbumItem
            {album}
            browseArtist={explorer.exploreArtist}
            browseAlbum={explorer.exploreAlbum}
          />
        {/each}
      </div>
    {/if}

    {#if explorer.tracks && explorer.tracks.length > 0}
      <div class="flex flex-col gap-0.5">
        {#each explorer.tracks as track, index (track.video_id + index)}
          <ExplorerTrackItem
            {track}
            onEnqueue={player.enqueue}
            onDownload={downloadTrack}
            browseArtist={explorer.exploreArtist}
            browseAlbum={explorer.exploreAlbum}
          />
        {/each}
      </div>
    {/if}

    {#if explorer.activeArtist}
      <ExplorerArtistDetails
        artist={explorer.activeArtist}
        browseAlbum={explorer.exploreAlbum}
        onEnqueueTrack={player.enqueue}
        onDownloadTrack={downloadTrack}
      />
    {/if}

    {#if explorer.activeAlbum}
      <ExplorerAlbumDetails
        album={explorer.activeAlbum}
        browseArtist={explorer.exploreArtist}
        onEnqueueTrack={player.enqueue}
        onDownloadTrack={downloadTrack}
      />
    {/if}
  </div>
</div>
