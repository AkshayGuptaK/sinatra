<script lang="ts">
  import type { RemoteTrack } from "$lib/api/explore";
  import { formatTime } from "$lib/utils/time";
  import {
    Play,
    Pause,
    Check,
    Music,
    Video,
    ListPlus,
    ListX,
    Download,
  } from "@lucide/svelte";

  export interface Props {
    track: RemoteTrack;
    isActive?: boolean;
    isPlaying?: boolean;
    isQueued?: boolean;
    class?: string;
    onPlay?: (track: RemoteTrack) => void;
    onEnqueue?: (track: RemoteTrack) => void;
    onDequeue?: (track: RemoteTrack) => void;
    onDownload?: (track: RemoteTrack) => void;
    browseArtist?: (artistId: string) => void;
    browseAlbum?: (albumId: string) => void;
  }

  let {
    track,
    isActive = false,
    isPlaying = false,
    isQueued = false,
    class: className = "",
    onPlay,
    onEnqueue,
    onDequeue,
    onDownload,
    browseArtist,
    browseAlbum,
  }: Props = $props();

  let isImageLoaded = $state(false);
  let isImageError = $state(false);

  function handleRowClick() {
    onPlay?.(track);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPlay?.(track);
    }
  }

  function handlePlayClick(e: MouseEvent) {
    e.stopPropagation();
    onPlay?.(track);
  }

  function handleQueueToggle(e: MouseEvent) {
    e.stopPropagation();
    if (isQueued) {
      onDequeue?.(track);
    } else {
      onEnqueue?.(track);
    }
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
  aria-label="{track.title} by {track.artist}"
>
  <div
    class="relative shrink-0 w-11 h-11 rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 flex items-center justify-center"
  >
    {#if track.thumbnail && !isImageError}
      <img
        src={track.thumbnail}
        alt="{track.title} artwork"
        loading="lazy"
        onload={() => (isImageLoaded = true)}
        onerror={() => (isImageError = true)}
        class="w-full h-full object-cover transition-opacity duration-200 {isImageLoaded
          ? 'opacity-100'
          : 'opacity-0'}"
      />
    {:else}
      <div class="text-neutral-600">
        {#if track.result_type === "video"}
          <Video class="w-5 h-5" />
        {:else}
          <Music class="w-5 h-5" />
        {/if}
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

    <button
      type="button"
      onclick={handlePlayClick}
      aria-label={isPlaying ? "Pause track" : "Play track"}
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
  </div>

  <div class="flex flex-col min-w-0 flex-1 justify-center">
    <div class="flex items-center gap-1.5 min-w-0">
      <span
        class="text-sm font-medium truncate leading-tight transition-colors {isActive
          ? 'text-emerald-400 font-semibold'
          : 'text-neutral-100 group-hover:text-white'}"
        title={track.title}
      >
        {track.title}
      </span>

      {#if track.result_type === "video"}
        <span
          class="shrink-0 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700/60 leading-none"
        >
          Video
        </span>
      {/if}
    </div>

    <div
      class="flex items-center gap-1.5 text-xs text-neutral-400 truncate mt-0.5 leading-normal"
    >
      {#if track.artist_id}
        <button
          type="button"
          class="truncate text-left hover:text-secondary-foreground transition-colors"
          title={track.artist}
          onclick={(e) => {
            e.stopPropagation();
            browseArtist?.(track.artist_id!);
          }}
        >
          {track.artist || "Unknown Artist"}
        </button>
      {:else}
        <span class="truncate" title={track.artist}>
          {track.artist || "Unknown Artist"}
        </span>
      {/if}

      {#if track.album}
        <span class="text-neutral-600 shrink-0">•</span>

        {#if track.album_id}
          <button
            type="button"
            class="truncate text-left text-neutral-500 hover:text-secondary-foreground transition-colors"
            title={track.album}
            onclick={(e) => {
              e.stopPropagation();
              browseAlbum?.(track.album_id!);
            }}
          >
            {track.album}
          </button>
        {:else}
          <span class="truncate text-neutral-500" title={track.album}>
            {track.album}
          </span>
        {/if}
      {/if}
    </div>
  </div>

  <div class="flex items-center gap-2 shrink-0">
    <button
      type="button"
      onclick={handleQueueToggle}
      title={isQueued ? "Remove from queue" : "Add to queue"}
      aria-label={isQueued ? "Remove from queue" : "Add to queue"}
      class="p-1.5 rounded-md transition-all text-neutral-400 hover:text-secondary-foreground hover:bg-neutral-800 {isQueued
        ? 'opacity-100 text-emerald-400 bg-neutral-800/80 hover:text-rose-400'
        : 'opacity-0 group-hover:opacity-100 focus:opacity-100'}"
    >
      {#if isQueued}
        <span class="group/btn relative flex items-center justify-center">
          <Check class="w-4 h-4 group-hover/btn:hidden" />
          <ListX class="w-4 h-4 hidden group-hover/btn:block text-rose-400" />
        </span>
      {:else}
        <ListPlus class="w-4 h-4" />
      {/if}
    </button>

    <button
      type="button"
      onclick={() => onDownload?.(track)}
      title={"Download Track"}
      aria-label={"Download Track"}
      class="p-1.5 rounded-md transition-all text-neutral-400 hover:text-secondary-foreground hover:bg-neutral-800 opacity-0 group-hover:opacity-100 focus:opacity-100"
    >
      <Download class="w-4 h-4" />
    </button>

    {#if track.duration != null && track.duration > 0}
      <span class="text-xs tabular-nums text-neutral-500 w-11 text-right">
        {formatTime(track.duration)}
      </span>
    {/if}
  </div>
</div>
