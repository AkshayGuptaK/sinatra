<script lang="ts">
  import type { RemotePlaylist } from "$lib/api/explore";
  import { Disc, ListPlus } from "@lucide/svelte";

  export interface Props {
    playlist: RemotePlaylist;
    class?: string;
    onEnqueue?: (playlist: RemotePlaylist) => void;
    browsePlaylist?: (playlistId: string) => void;
  }

  let {
    playlist,
    class: className = "",
    onEnqueue,
    browsePlaylist,
  }: Props = $props();

  let isImageLoaded = $state(false);
  let isImageError = $state(false);

  function handleRowClick() {
    if (playlist.playlist_id) {
      browsePlaylist?.(playlist.playlist_id);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleRowClick();
    }
  }

  function handleEnqueueClick(e: MouseEvent) {
    e.stopPropagation();
    onEnqueue?.(playlist);
  }
</script>

<div
  role="button"
  tabindex="0"
  onclick={handleRowClick}
  onkeydown={handleKeydown}
  class="group min-w-0 overflow-hidden relative flex flex-col items-center gap-3.5 w-full px-3 py-2 rounded-lg text-left select-none transition-colors duration-150 border border-transparent outline-none cursor-pointer hover:bg-neutral-900/60 active:bg-neutral-800/50 {className}"
  aria-label="{playlist.title} by {playlist.author}"
>
  <div
    class="relative w-full aspect-square shrink-0 rounded-md overflow-hidden bg-neutral-900 border border-neutral-800 flex items-center justify-center"
  >
    {#if playlist.thumbnail && !isImageError}
      <img
        src={playlist.thumbnail}
        alt="{playlist.title} artwork"
        loading="lazy"
        onload={() => (isImageLoaded = true)}
        onerror={() => (isImageError = true)}
        class="w-full h-full object-cover transition-opacity duration-200 {isImageLoaded
          ? 'opacity-100'
          : 'opacity-0'}"
      />
    {:else}
      <div class="text-neutral-600">
        <Disc class="w-2/5 h-2/5 max-w-12 max-h-12 min-w-5 min-h-5 shrink-0" />
      </div>
    {/if}
  </div>

  <!-- Primary Metadata Details -->
  <div class="flex flex-col items-center justify-center w-full min-w-0 flex-1">
    <div
      class="w-full text-center text-sm font-medium truncate leading-tight transition-colors text-neutral-100 group-hover:text-secondary-foreground"
      title={playlist.title}
    >
      {playlist.title}
    </div>

    <div
      class="flex items-center justify-center gap-1.5 w-full min-w-0 text-xs text-neutral-400 mt-0.5 leading-normal"
    >
      {#if playlist.author}
        <span class="min-w-0 truncate" title={playlist.author}>
          {playlist.author}
        </span>
      {/if}

      {#if playlist.track_count}
        <span class="text-neutral-600 shrink-0">•</span>
        <span class="shrink-0">{playlist.track_count} tracks</span>
      {/if}
    </div>
  </div>

  <!-- Trailing Actions & Duration -->
  <div class="flex items-center gap-2 shrink-0">
    {#if onEnqueue}
      <button
        type="button"
        onclick={handleEnqueueClick}
        title="Add playlist to queue"
        aria-label="Add playlist to queue"
        class="p-1.5 rounded-md transition-all text-neutral-400 hover:text-white hover:bg-neutral-800 opacity-0 group-hover:opacity-100 focus:opacity-100"
      >
        <ListPlus class="w-4 h-4" />
      </button>
    {/if}
  </div>
</div>
