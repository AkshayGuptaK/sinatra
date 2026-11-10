<script lang="ts">
  import type { RemoteAlbumDetails, RemoteTrack } from "$lib/api/explore";
  import ExplorerTrackItem from "./ExplorerTrackItem.svelte";
  import { formatTime } from "$lib/utils/time";
  import {
    Play,
    Pause,
    Disc,
    ListPlus,
    ChevronDown,
    ChevronUp,
    Music,
  } from "@lucide/svelte";

  export interface Props {
    album: RemoteAlbumDetails;
    isActive?: boolean;
    isPlaying?: boolean;
    class?: string;
    onPlay?: (album: RemoteAlbumDetails) => void;
    onEnqueue?: (album: RemoteAlbumDetails) => void;
    browseArtist?: (artistId: string) => void;

    // Tracklist item props
    activeTrackId?: string | null;
    playingTrackId?: string | null;
    queuedTrackIds?: Set<string>;
    onPlayTrack?: (track: RemoteTrack) => void;
    onEnqueueTrack?: (track: RemoteTrack) => void;
    onDequeueTrack?: (track: RemoteTrack) => void;
    onDownloadTrack?: (track: RemoteTrack) => void;
  }

  let {
    album,
    isActive = false,
    isPlaying = false,
    class: className = "",
    onPlay,
    onEnqueue,
    browseArtist,
    activeTrackId = null,
    playingTrackId = null,
    queuedTrackIds = new Set<string>(),
    onPlayTrack,
    onEnqueueTrack,
    onDequeueTrack,
    onDownloadTrack,
  }: Props = $props();

  let isImageLoaded = $state(false);
  let isImageError = $state(false);
  let isExpanded = $state(true);

  function handlePlayClick(e: MouseEvent) {
    e.stopPropagation();
    onPlay?.(album);
  }

  function handleEnqueueClick(e: MouseEvent) {
    e.stopPropagation();
    onEnqueue?.(album);
  }

  function toggleTracks(e: MouseEvent) {
    e.stopPropagation();
    isExpanded = !isExpanded;
  }
</script>

<div
  class="flex flex-col w-full rounded-xl border border-neutral-800/80 bg-neutral-900/40 hover:border-neutral-700/70 transition-all duration-150 overflow-hidden shadow-sm {isActive
    ? 'ring-1 ring-emerald-500/50 border-neutral-700 bg-neutral-900/60'
    : ''} {className}"
>
  <!-- Album Header Block -->
  <div
    class="group relative flex items-start sm:items-center gap-4 p-3.5 sm:p-4"
  >
    <!-- Vinyl Sleeve / Album Artwork Frame -->
    <div
      class="relative shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-neutral-900 border border-neutral-800/80 shadow-md flex items-center justify-center"
    >
      {#if album.thumbnail && !isImageError}
        <img
          src={album.thumbnail}
          alt="{album.title} cover"
          loading="lazy"
          onload={() => (isImageLoaded = true)}
          onerror={() => (isImageError = true)}
          class="w-full h-full object-cover transition-opacity duration-200 {isImageLoaded
            ? 'opacity-100'
            : 'opacity-0'}"
        />
      {:else}
        <div class="text-neutral-600 flex flex-col items-center gap-1">
          <Disc class="w-8 h-8" />
        </div>
      {/if}

      <!-- Animated equalizer bars if actively playing -->
      {#if isPlaying}
        <div
          class="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center gap-0.5 group-hover:opacity-0 transition-opacity"
        >
          <span
            class="w-0.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]"
          ></span>
          <span
            class="w-0.5 h-6 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]"
          ></span>
          <span class="w-0.5 h-3.5 bg-emerald-400 rounded-full animate-bounce"
          ></span>
        </div>
      {/if}

      {#if onPlay}
        <button
          type="button"
          onclick={handlePlayClick}
          aria-label={isPlaying ? "Pause album" : "Play album"}
          class="absolute inset-0 flex items-center justify-center bg-black/60 text-white transition-opacity duration-150 {isPlaying
            ? 'opacity-0 group-hover:opacity-100'
            : isActive
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100'}"
        >
          {#if isPlaying}
            <Pause class="w-7 h-7 fill-current text-emerald-400" />
          {:else}
            <Play class="w-7 h-7 fill-current translate-x-0.5 text-white" />
          {/if}
        </button>
      {/if}
    </div>

    <!-- Album Metadata -->
    <div class="flex flex-col min-w-0 flex-1 justify-center self-center py-0.5">
      <div class="flex items-center gap-2 mb-1">
        <span
          class="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700/60 leading-none shrink-0"
        >
          <Disc class="w-3 h-3 text-neutral-400" />
          {album.album_type || "Album"}
        </span>

        {#if album.year}
          <span class="text-xs text-neutral-500 font-mono">
            {album.year}
          </span>
        {/if}
      </div>

      <!-- Title -->
      <h3
        class="text-base sm:text-lg font-bold truncate leading-tight transition-colors {isActive
          ? 'text-emerald-400'
          : 'text-neutral-100 group-hover:text-white'}"
        title={album.title}
      >
        {album.title}
      </h3>

      <!-- Artist & Aggregate Details -->
      <div
        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-neutral-400 mt-1 leading-normal"
      >
        {#if album.artist_id}
          <button
            type="button"
            class="truncate text-left text-neutral-300 hover:text-white hover:underline transition-colors font-medium"
            title={album.artist}
            onclick={(e) => {
              e.stopPropagation();
              browseArtist?.(album.artist_id!);
            }}
          >
            {album.artist || "Unknown Artist"}
          </button>
        {:else}
          <span
            class="truncate font-medium text-neutral-300"
            title={album.artist}
          >
            {album.artist || "Unknown Artist"}
          </span>
        {/if}

        {#if album.track_count != null && album.track_count > 0}
          <span class="text-neutral-600 shrink-0">•</span>
          <span class="shrink-0">
            {album.track_count}
            {album.track_count === 1 ? "track" : "tracks"}
          </span>
        {/if}

        {#if album.duration_seconds != null && album.duration_seconds > 0}
          <span class="text-neutral-600 shrink-0">•</span>
          <span class="shrink-0 font-mono text-neutral-400">
            {formatTime(album.duration_seconds)}
          </span>
        {/if}
      </div>
    </div>

    <!-- Header Actions (Enqueue / Collapse Toggle) -->
    <div class="flex items-center gap-1.5 shrink-0 self-center">
      {#if onEnqueue}
        <button
          type="button"
          onclick={handleEnqueueClick}
          title="Add entire album to queue"
          aria-label="Add entire album to queue"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium bg-neutral-800 hover:bg-neutral-700/80 text-neutral-200 border border-neutral-700/60 transition-colors"
        >
          <ListPlus class="w-4 h-4 text-neutral-400" />
          <span class="hidden sm:inline">Queue Album</span>
        </button>
      {/if}

      {#if album.tracks && album.tracks.length > 0}
        <button
          type="button"
          onclick={toggleTracks}
          title={isExpanded ? "Collapse tracklist" : "Expand tracklist"}
          aria-label={isExpanded ? "Collapse tracklist" : "Expand tracklist"}
          class="p-2 rounded-md text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
        >
          {#if isExpanded}
            <ChevronUp class="w-4 h-4" />
          {:else}
            <ChevronDown class="w-4 h-4" />
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <!-- Album Tracklist Container -->
  {#if album.tracks && album.tracks.length > 0 && isExpanded}
    <div
      class="border-t border-neutral-800/80 bg-neutral-950/40 p-1 sm:p-2 flex flex-col gap-0.5"
    >
      {#each album.tracks as track, index (track.video_id || index)}
        <div class="flex items-center w-full">
          <!-- Optional Track Number Gutter -->
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
              {browseArtist}
            />
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
