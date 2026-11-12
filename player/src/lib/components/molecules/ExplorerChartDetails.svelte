<!-- src/lib/components/molecules/ExplorerChartDetails.svelte -->
<script lang="ts">
  import type { RemoteCharts } from "$lib/api/explore";
  import ExplorerArtistItem from "./ExplorerArtistItem.svelte";
  import ExplorerPlaylistItem from "./ExplorerPlaylistItem.svelte";
  import { Flame, TrendingUp, BarChart3 } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  export interface Props {
    chart: RemoteCharts;
    class?: string;
    browseArtist?: (artistId: string) => void;
    browsePlaylist?: (playlistId: string) => void;
  }

  let {
    class: className = "",
    chart,
    browseArtist,
    browsePlaylist,
  }: Props = $props();

  const playlists = $derived(chart?.playlists ?? []);
  const artists = $derived(chart?.artists ?? []);
  const hasContent = $derived(playlists.length > 0 || artists.length > 0);
</script>

{#if hasContent}
  <div class={cn("flex flex-col gap-6 w-full", className)}>
    {#if playlists.length > 0}
      <section class="flex flex-col gap-3">
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <Flame class="w-4 h-4 text-secondary-foreground shrink-0" />
            <h3
              class="text-xs font-bold uppercase tracking-wider text-neutral-300"
            >
              Top Charts
            </h3>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {#each playlists as playlist (playlist.playlist_id)}
            <ExplorerPlaylistItem {playlist} {browsePlaylist} showTag={false}/>
          {/each}
        </div>
      </section>
    {/if}

    {#if artists.length > 0}
      <section
        class={cn(
          "flex flex-col gap-3",
          playlists.length > 0 && "pt-5 border-t border-neutral-800/60"
        )}
      >
        <div class="flex items-center justify-between px-1">
          <div class="flex items-center gap-2">
            <TrendingUp class="w-4 h-4 text-secondary-foreground shrink-0" />
            <h3
              class="text-xs font-bold uppercase tracking-wider text-neutral-300"
            >
              Trending Artists
            </h3>
          </div>
        </div>

        <div
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2"
        >
          {#each artists as artist (artist.browse_id)}
            <ExplorerArtistItem {artist} {browseArtist} showTag={false} />
          {/each}
        </div>
      </section>
    {/if}
  </div>
{:else}
  <div
    class={cn(
      "flex flex-col items-center justify-center py-12 px-4 text-center rounded-xl border border-neutral-800/60 bg-neutral-900/20 text-neutral-500",
      className
    )}
  >
    <BarChart3 class="w-7 h-7 mb-2 text-neutral-600" />
    <p class="text-xs font-medium text-neutral-400">No chart data available</p>
  </div>
{/if}
