<script lang="ts">
  import { cn } from "$lib/utils";
  import { Compass } from "@lucide/svelte";
  import type {
    RemoteAlbumDetails,
    RemotePlaylistDetails,
    RemoteTrack,
  } from "$lib/api/explore";
  import { explorer } from "$lib/core/explorer.svelte";
  import { player } from "$lib/core/player.svelte";
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import ExplorerTrackItem from "$lib/components/molecules/ExplorerTrackItem.svelte";
  import ExplorerAlbumItem from "../molecules/ExplorerAlbumItem.svelte";
  import ExplorerAlbumDetails from "../molecules/ExplorerAlbumDetails.svelte";
  import ExplorerArtistItem from "../molecules/ExplorerArtistItem.svelte";
  import ExplorerArtistDetails from "../molecules/ExplorerArtistDetails.svelte";
  import ExplorerMoodCategories from "../molecules/ExplorerMoodCategories.svelte";
  import ExplorerPlaylistItem from "../molecules/ExplorerPlaylistItem.svelte";
  import ExplorerChartDetails from "../molecules/ExplorerChartDetails.svelte";
  import ExplorerPlaylistDetails from "../molecules/ExplorerPlaylistDetails.svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  const queuedTrackIds = $derived(new Set(player.queue.map((t) => t.id)));

  function downloadTrack(track: RemoteTrack) {
    explorer.download(track.video_id);
  }

  function downloadAll(collection: RemoteAlbumDetails | RemotePlaylistDetails) {
    collection.tracks.forEach(downloadTrack);
  }

  function enqueueAll(collection: RemoteAlbumDetails | RemotePlaylistDetails) {
    collection.tracks.forEach(player.enqueue);
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

    {#if explorer.playlists && explorer.playlists.length > 0}
      <div
        class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
      >
        {#each explorer.playlists as playlist, index (playlist.playlist_id + index)}
          <ExplorerPlaylistItem
            {playlist}
            browsePlaylist={explorer.explorePlaylist}
          />
        {/each}
      </div>
    {/if}

    {#if explorer.tracks && explorer.tracks.length > 0}
      <div class="flex flex-col gap-0.5">
        {#each explorer.tracks as track, index (track.video_id + index)}
          <ExplorerTrackItem
            {track}
            isActive={player.currentTrackId === track.video_id}
            isPlaying={player.currentTrackId === track.video_id &&
              player.engine.isPlaying}
            isQueued={queuedTrackIds.has(track.video_id)}
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
        activeTrackId={player.currentTrackId}
        queuedTrackIds={queuedTrackIds}
        isPlaying={player.engine.isPlaying}
        onEnqueueTrack={player.enqueue}
        onDownloadTrack={downloadTrack}
      />
    {/if}

    {#if explorer.activeAlbum}
      <ExplorerAlbumDetails
        album={explorer.activeAlbum}
        browseArtist={explorer.exploreArtist}
        activeTrackId={player.currentTrackId}
        queuedTrackIds={queuedTrackIds}
        isPlaying={player.engine.isPlaying}
        onDownload={downloadAll}
        onEnqueue={enqueueAll}
        onEnqueueTrack={player.enqueue}
        onDownloadTrack={downloadTrack}
      />
    {/if}

    {#if explorer.activePlaylist}
      <ExplorerPlaylistDetails
        playlist={explorer.activePlaylist}
        browseArtist={explorer.exploreArtist}
        activeTrackId={player.currentTrackId}
        queuedTrackIds={queuedTrackIds}
        isPlaying={player.engine.isPlaying}
        onDownload={downloadAll}
        onEnqueue={enqueueAll}
        onEnqueueTrack={player.enqueue}
        onDownloadTrack={downloadTrack}
      />
    {/if}

    {#if explorer.topCharts}
      <ExplorerChartDetails
        chart={explorer.topCharts}
        browseArtist={explorer.exploreArtist}
        browsePlaylist={explorer.explorePlaylist}
      />
    {/if}

    <ExplorerMoodCategories
      categories={explorer.moodCategories}
      activeCategory={explorer.activeCategory}
      onSelect={explorer.exploreMood}
    />
  </div>
</div>
