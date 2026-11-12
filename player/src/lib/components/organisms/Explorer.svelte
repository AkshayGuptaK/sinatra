<script lang="ts">
  import { cn } from "$lib/utils";
  import { Compass, ChevronLeft, ChevronRight } from "@lucide/svelte";
  import type {
    RemoteAlbumDetails,
    RemotePlaylistDetails,
    RemoteTrack,
  } from "$lib/api/explore";
  import { explorer } from "$lib/core/explorer.svelte";
  import { player } from "$lib/core/player.svelte";
  import { ui } from "$lib/stores/ui.svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
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

  function isEditableElement(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target.isContentEditable
    );
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (ui.activeDeck !== "explore") return;
    if (isEditableElement(e.target)) return;

    // Alt+Left / Alt+Right or Cmd+[ / Cmd+] (Ctrl+[ / Ctrl+])
    const isBackShortcut =
      (e.altKey && e.key === "ArrowLeft") ||
      ((e.metaKey || e.ctrlKey) && e.key === "[");

    const isForwardShortcut =
      (e.altKey && e.key === "ArrowRight") ||
      ((e.metaKey || e.ctrlKey) && e.key === "]");

    if (isBackShortcut && explorer.canGoBack) {
      e.preventDefault();
      explorer.back();
    } else if (isForwardShortcut && explorer.canGoForward) {
      e.preventDefault();
      explorer.forward();
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (ui.activeDeck !== "explore") return;

    // Mouse Button 3 (Browser Back) & Button 4 (Browser Forward)
    if (e.button === 3) {
      e.preventDefault();
      if (explorer.canGoBack) explorer.back();
    } else if (e.button === 4) {
      e.preventDefault();
      if (explorer.canGoForward) explorer.forward();
    }
  }
</script>

<svelte:window onkeydown={handleKeyDown} onmouseup={handleMouseUp} />

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
      <div
        class="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs"
      >
        <ControlButton
          icon={ChevronLeft}
          onClick={() => explorer.back()}
          disabled={!explorer.canGoBack}
          label="Go back"
          title="Back (Alt+Left / Cmd+[)"
          class="size-7 p-1 rounded-md text-muted-foreground hover:text-secondary-foreground hover:bg-transparent disabled:opacity-40"
          iconClass="size-4"
        />
        <ControlButton
          icon={ChevronRight}
          onClick={() => explorer.forward()}
          disabled={!explorer.canGoForward}
          label="Go forward"
          title="Forward (Alt+Right / Cmd+])"
          class="size-7 p-1 rounded-md text-muted-foreground hover:text-secondary-foreground hover:bg-transparent disabled:opacity-40"
          iconClass="size-4"
        />
      </div>
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
