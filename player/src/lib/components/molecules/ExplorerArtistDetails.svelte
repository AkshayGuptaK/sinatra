<!-- src/lib/components/molecules/ExplorerArtistDetails.svelte -->
<script lang="ts">
  import type {
    RemoteArtistDetails,
    RemoteAlbum,
    RemoteTrack,
  } from "$lib/api/explore";
  import ExplorerTrackItem from "./ExplorerTrackItem.svelte";
  import ExplorerAlbumItem from "./ExplorerAlbumItem.svelte";
  import {
    Play,
    Pause,
    User,
    ListPlus,
    ChevronDown,
    ChevronUp,
    Disc,
    Music,
    Users,
    ArrowRight,
  } from "@lucide/svelte";

  export interface Props {
    artist: RemoteArtistDetails;
    isActive?: boolean;
    isPlaying?: boolean;
    class?: string;
    onPlay?: (artist: RemoteArtistDetails) => void;
    onEnqueue?: (artist: RemoteArtistDetails) => void;
    browseAlbum?: (albumId: string) => void;
    onSeeAllAlbums?: (artistId: string, params: string) => void;

    // Tracklist item props
    activeTrackId?: string | null;
    playingTrackId?: string | null;
    queuedTrackIds?: Set<string>;
    onPlayTrack?: (track: RemoteTrack) => void;
    onEnqueueTrack?: (track: RemoteTrack) => void;
    onDequeueTrack?: (track: RemoteTrack) => void;
    onDownloadTrack?: (track: RemoteTrack) => void;

    // Album item props
    activeAlbumId?: string | null;
    playingAlbumId?: string | null;
    onPlayAlbum?: (album: RemoteAlbum) => void;
    onEnqueueAlbum?: (album: RemoteAlbum) => void;
  }

  let {
    artist,
    isActive = false,
    isPlaying = false,
    class: className = "",
    onPlay,
    onEnqueue,
    browseAlbum,
    onSeeAllAlbums,
    activeTrackId = null,
    playingTrackId = null,
    queuedTrackIds = new Set<string>(),
    onPlayTrack,
    onEnqueueTrack,
    onDequeueTrack,
    onDownloadTrack,
    activeAlbumId = null,
    playingAlbumId = null,
    onPlayAlbum,
    onEnqueueAlbum,
  }: Props = $props();

  let isImageLoaded = $state(false);
  let isImageError = $state(false);
  let isSongsExpanded = $state(true);
  let isAlbumsExpanded = $state(true);
  let isBioExpanded = $state(false);

  function handlePlayClick(e: MouseEvent) {
    e.stopPropagation();
    onPlay?.(artist);
  }

  function handleEnqueueClick(e: MouseEvent) {
    e.stopPropagation();
    onEnqueue?.(artist);
  }

  function toggleSongs(e: MouseEvent) {
    e.stopPropagation();
    isSongsExpanded = !isSongsExpanded;
  }

  function toggleAlbums(e: MouseEvent) {
    e.stopPropagation();
    isAlbumsExpanded = !isAlbumsExpanded;
  }
</script>

<div
  class="flex flex-col w-full rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700/70 transition-all duration-150 overflow-hidden shadow-sm {isActive
    ? 'ring-1 ring-emerald-500/50 border-neutral-700 bg-neutral-900/60'
    : ''} {className}"
>
  <!-- Artist Header Banner Block -->
  <div
    class="group relative flex items-start sm:items-center gap-4 p-3.5 sm:p-5"
  >
    <!-- Circular Artist Portrait Frame -->
    <div
      class="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-full overflow-hidden bg-neutral-900 border border-neutral-800/80 shadow-md flex items-center justify-center"
    >
      {#if artist.thumbnail && !isImageError}
        <img
          src={artist.thumbnail}
          alt="{artist.name} portrait"
          loading="lazy"
          onload={() => (isImageLoaded = true)}
          onerror={() => (isImageError = true)}
          class="w-full h-full object-cover transition-opacity duration-200 {isImageLoaded
            ? 'opacity-100'
            : 'opacity-0'}"
        />
      {:else}
        <div class="text-neutral-600 flex flex-col items-center justify-center">
          <User class="w-9 h-9" />
        </div>
      {/if}

      <!-- Animated equalizer bars if actively playing -->
      {#if isPlaying}
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center gap-0.5 group-hover:opacity-0 transition-opacity"
        >
          <span
            class="w-0.5 h-4 bg-secondary-foreground rounded-full animate-bounce [animation-delay:-0.3s]"
          ></span>
          <span
            class="w-0.5 h-6 bg-secondary-foreground rounded-full animate-bounce [animation-delay:-0.15s]"
          ></span>
          <span class="w-0.5 h-3.5 bg-secondary-foreground rounded-full animate-bounce"
          ></span>
        </div>
      {/if}

      {#if onPlay}
        <button
          type="button"
          onclick={handlePlayClick}
          aria-label={isPlaying ? "Pause artist" : "Play artist top songs"}
          class="absolute inset-0 flex items-center justify-center bg-black/60 text-white transition-opacity duration-150 {isPlaying
            ? 'opacity-0 group-hover:opacity-100'
            : isActive
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'}"
        >
          {#if isPlaying}
            <Pause class="w-7 h-7 fill-current text-secondary-foreground" />
          {:else}
            <Play class="w-7 h-7 fill-current translate-x-0.5 text-white" />
          {/if}
        </button>
      {/if}
    </div>

    <!-- Artist Metadata -->
    <div class="flex flex-col min-w-0 flex-1 justify-center self-center py-0.5">
      <div class="flex items-center gap-2 mb-1">
        <span
          class="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700/60 leading-none shrink-0"
        >
          <User class="w-3 h-3 text-neutral-400" />
          Artist
        </span>

        {#if artist.subscribers}
          <span class="flex items-center gap-1 text-xs text-neutral-400">
            <Users class="w-3.5 h-3.5 text-neutral-500" />
            {artist.subscribers}
          </span>
        {/if}
      </div>

      <!-- Artist Name -->
      <h2
        class="text-lg sm:text-2xl font-bold truncate leading-tight transition-colors {isActive
          ? 'text-secondary-foreground'
          : 'text-neutral-100 group-hover:text-white'}"
        title={artist.name}
      >
        {artist.name}
      </h2>

      <!-- Track & Release Counts -->
      <div
        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400 mt-1 leading-normal"
      >
        {#if artist.albums?.items && artist.albums.items.length > 0}
          <span>
            {artist.albums.items.length}
            {artist.albums.items.length === 1 ? "album" : "albums"}
          </span>
        {/if}
      </div>

      <!-- Expandable Description / Bio -->
      {#if artist.description}
        <div class="mt-2 text-xs text-neutral-400 max-w-2xl">
          <p
            class={isBioExpanded
              ? "leading-relaxed"
              : "line-clamp-2 leading-relaxed"}
          >
            {artist.description}
          </p>
          {#if artist.description.length > 120}
            <button
              type="button"
              onclick={() => (isBioExpanded = !isBioExpanded)}
              class="text-secondary-foreground hover:underline font-medium text-[11px] mt-0.5"
            >
              {isBioExpanded ? "Show less" : "Read more"}
            </button>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Header Actions (Enqueue Artist) -->
    <div class="flex items-center gap-1.5 shrink-0 self-center">
      {#if onEnqueue}
        <button
          type="button"
          onclick={handleEnqueueClick}
          title="Add top songs to queue"
          aria-label="Add top songs to queue"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-neutral-800 hover:bg-neutral-700/80 text-neutral-200 border border-neutral-700/60 transition-colors"
        >
          <ListPlus class="w-4 h-4 text-neutral-400" />
          <span class="hidden sm:inline">Queue Artist</span>
        </button>
      {/if}
    </div>
  </div>

  {#if artist.songs && artist.songs.length > 0}
    <div class="border-t border-neutral-800/80 bg-neutral-950/40">
      <div
        class="flex items-center justify-between px-3.5 py-2.5 bg-neutral-900/60 border-b border-neutral-800/60 select-none"
      >
        <div class="flex items-center gap-2">
          <Music class="w-4 h-4 text-secondary-foreground" />
          <span
            class="text-xs uppercase font-bold tracking-wider text-neutral-300"
          >
            Top Songs
          </span>
          <span class="text-xs text-neutral-500 font-mono">
            ({artist.songs.length})
          </span>
        </div>

        <button
          type="button"
          onclick={toggleSongs}
          title={isSongsExpanded ? "Collapse songs" : "Expand songs"}
          aria-label={isSongsExpanded ? "Collapse songs" : "Expand songs"}
          class="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          {#if isSongsExpanded}
            <ChevronUp class="w-4 h-4" />
          {:else}
            <ChevronDown class="w-4 h-4" />
          {/if}
        </button>
      </div>

      {#if isSongsExpanded}
        <div class="p-1 sm:p-2 flex flex-col gap-0.5">
          {#each artist.songs as track, index (track.video_id || index)}
            <div class="flex items-center w-full">
              <span
                class="w-6 shrink-0 text-center text-xs font-mono text-neutral-600 pl-1"
              >
                {index + 1}
              </span>

              <div class="flex-1 min-w-0">
                <ExplorerTrackItem
                  {track}
                  isActive={activeTrackId === track.video_id}
                  isPlaying={playingTrackId === track.video_id}
                  isQueued={queuedTrackIds.has(track.video_id)}
                  onPlay={onPlayTrack}
                  onEnqueue={onEnqueueTrack}
                  onDequeue={onDequeueTrack}
                  onDownload={onDownloadTrack}
                  {browseAlbum}
                />
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}

  {#if artist.albums?.items && artist.albums.items.length > 0}
    <div class="border-t border-neutral-800/80 bg-neutral-950/20">
      <div
        class="flex items-center justify-between px-3.5 py-2.5 bg-neutral-900/60 border-b border-neutral-800/60 select-none"
      >
        <div class="flex items-center gap-2">
          <Disc class="w-4 h-4 text-secondary-foreground" />
          <span
            class="text-xs uppercase font-bold tracking-wider text-neutral-300"
          >
            Albums & Releases
          </span>
          <span class="text-xs text-neutral-500 font-mono">
            ({artist.albums.items.length})
          </span>
        </div>

        <div class="flex items-center gap-2">
          {#if artist.albums.params && onSeeAllAlbums}
            <button
              type="button"
              onclick={() =>
                onSeeAllAlbums?.(artist.browse_id, artist.albums.params!)}
              class="flex items-center gap-1 text-xs text-neutral-400 hover:text-white transition-colors"
            >
              <span>See all</span>
              <ArrowRight class="w-3.5 h-3.5" />
            </button>
          {/if}

          <button
            type="button"
            onclick={toggleAlbums}
            title={isAlbumsExpanded ? "Collapse albums" : "Expand albums"}
            aria-label={isAlbumsExpanded ? "Collapse albums" : "Expand albums"}
            class="p-1 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
          >
            {#if isAlbumsExpanded}
              <ChevronUp class="w-4 h-4" />
            {:else}
              <ChevronDown class="w-4 h-4" />
            {/if}
          </button>
        </div>
      </div>

      {#if isAlbumsExpanded}
        <div class="p-1 sm:p-2 flex flex-col gap-1">
          {#each artist.albums.items as album (album.browse_id)}
            <ExplorerAlbumItem
              {album}
              isActive={activeAlbumId === album.browse_id}
              isPlaying={playingAlbumId === album.browse_id}
              onPlay={onPlayAlbum}
              onEnqueue={onEnqueueAlbum}
              {browseAlbum}
            />
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</div>
