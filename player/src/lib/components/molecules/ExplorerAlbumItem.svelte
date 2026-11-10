<script lang="ts">
  import type { RemoteAlbum } from "$lib/api/explore";
  import { Play, Pause, Disc, ListPlus } from "@lucide/svelte";

  export interface Props {
    album: RemoteAlbum;
    isActive?: boolean;
    isPlaying?: boolean;
    class?: string;
    onPlay?: (album: RemoteAlbum) => void;
    onEnqueue?: (album: RemoteAlbum) => void;
    browseArtist?: (artistId: string) => void;
    browseAlbum?: (albumId: string) => void;
  }

  let {
    album,
    isActive = false,
    isPlaying = false,
    class: className = "",
    onPlay,
    onEnqueue,
    browseArtist,
    browseAlbum,
  }: Props = $props();

  let isImageLoaded = $state(false);
  let isImageError = $state(false);

  function handleRowClick() {
    if (album.browse_id) {
      browseAlbum?.(album.browse_id);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick();
    }
  }

  function handlePlayClick(e: MouseEvent) {
    e.stopPropagation();
    onPlay?.(album);
  }

  function handleEnqueueClick(e: MouseEvent) {
    e.stopPropagation();
    onEnqueue?.(album);
  }
</script>

<div
  role="button"
  tabindex="0"
  onclick={handleRowClick}
  onkeydown={handleKeydown}
  class="group relative flex items-center gap-3.5 w-full px-3 py-2 rounded-lg text-left select-none transition-colors duration-150 border border-transparent outline-none cursor-pointer {isActive
    ? 'bg-neutral-800/80 border-neutral-700/60 shadow-sm'
    : 'hover:bg-neutral-900/60 active:bg-neutral-800/50'} {className}"
  aria-label="{album.title} by {album.artist}"
>
  <!-- Artwork / Thumbnail Container -->
  <div
    class="relative shrink-0 w-11 h-11 rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 flex items-center justify-center"
  >
    {#if album.thumbnail && !isImageError}
      <img
        src={album.thumbnail}
        alt="{album.title} artwork"
        loading="lazy"
        onload={() => (isImageLoaded = true)}
        onerror={() => (isImageError = true)}
        class="w-full h-full object-cover transition-opacity duration-200 {isImageLoaded
          ? 'opacity-100'
          : 'opacity-0'}"
      />
    {:else}
      <div class="text-neutral-600">
        <Disc class="w-5 h-5" />
      </div>
    {/if}

    {#if isPlaying}
      <div
        class="absolute inset-0 bg-black/60 backdrop-blur-[1px] flex items-center justify-center gap-0.5 group-hover:opacity-0 transition-opacity"
      >
        <span
          class="w-0.5 h-3 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]"
        ></span>
        <span
          class="w-0.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]"
        ></span>
        <span class="w-0.5 h-2.5 bg-emerald-400 rounded-full animate-bounce"
        ></span>
      </div>
    {/if}

    {#if onPlay}
      <button
        type="button"
        onclick={handlePlayClick}
        aria-label={isPlaying ? "Pause album" : "Play album"}
        class="absolute inset-0 flex items-center justify-center bg-black/55 text-white transition-opacity duration-150 {isPlaying
          ? 'opacity-0 group-hover:opacity-100'
          : isActive
            ? 'opacity-100'
            : 'opacity-0 group-hover:opacity-100'}"
      >
        {#if isPlaying}
          <Pause class="w-5 h-5 fill-current text-emerald-400" />
        {:else}
          <Play class="w-5 h-5 fill-current translate-x-0.5 text-white" />
        {/if}
      </button>
    {/if}
  </div>

  <!-- Primary Metadata Details -->
  <div class="flex flex-col min-w-0 flex-1 justify-center">
    <div class="flex items-center gap-1.5 min-w-0">
      <span
        class="text-sm font-medium truncate leading-tight transition-colors {isActive
          ? 'text-emerald-400 font-semibold'
          : 'text-neutral-100 group-hover:text-secondary-foreground'}"
        title={album.title}
      >
        {album.title}
      </span>

      {#if album.album_type && album.album_type.toLowerCase() !== "album"}
        <span
          class="shrink-0 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60 leading-none"
        >
          {album.album_type}
        </span>
      {/if}
    </div>

    <div
      class="flex items-center gap-1.5 text-xs text-neutral-400 truncate mt-0.5 leading-normal"
    >
      {#if album.artist_id && browseArtist}
        <button
          type="button"
          class="truncate text-left hover:text-secondary-foreground transition-colors"
          title={album.artist}
          onclick={(e) => {
            e.stopPropagation();
            browseArtist(album.artist_id!);
          }}
        >
          {album.artist || "Unknown Artist"}
        </button>
      {:else}
        <span class="truncate" title={album.artist}>
          {album.artist || "Unknown Artist"}
        </span>
      {/if}

      {#if album.year}
        <span class="text-neutral-600 shrink-0">•</span>
        <span class="shrink-0">{album.year}</span>
      {/if}
    </div>
  </div>

  <!-- Trailing Actions & Duration -->
  <div class="flex items-center gap-2 shrink-0">
    {#if onEnqueue}
      <button
        type="button"
        onclick={handleEnqueueClick}
        title="Add album to queue"
        aria-label="Add album to queue"
        class="p-1.5 rounded-md transition-all text-neutral-400 hover:text-white hover:bg-neutral-800 opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <ListPlus class="w-4 h-4" />
      </button>
    {/if}
  </div>
</div>
