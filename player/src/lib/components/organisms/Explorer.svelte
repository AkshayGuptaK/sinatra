<script lang="ts">
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import ExplorerTrackItem from "$lib/components/molecules/ExplorerTrackItem.svelte";
  import { Compass } from "@lucide/svelte";
  import { explorer } from "$lib/core/explorer.svelte";
  import { player } from "$lib/core/player.svelte";
  import { cn } from "$lib/utils";
  import type { RemoteTrack } from "$lib/api/explore";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  const queuedTrackIds = $derived(new Set(player.queue.map((t) => t.id)));

  function enqueueTrack(track: RemoteTrack) {
    const queueTrack = {
      ...track,
      id: track.video_id,
      album: track.album || "",
      start: 0,
      end: track.duration,
    };
    player.enqueue(queueTrack);
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <HeaderBanner title="Explorer" icon={Compass} />
  <div class="flex flex-col w-full gap-3 shrink-0">
    <div
      class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2"
    >
      <CommandBar deck="explore"/>
      <div
        class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end"
      >
        <!-- controls go here -->
      </div>
    </div>
    <div>
      {#each explorer.tracks as track}
        <ExplorerTrackItem {track} onEnqueue={enqueueTrack} onDownload={track => explorer.download(track.video_id)}/>
      {/each}
    </div>
  </div>
</div>
