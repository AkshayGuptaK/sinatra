<script lang="ts">
  import { onMount } from "svelte";
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import LibraryControls from "$lib/components/molecules/LibraryControls.svelte";
  import LibraryDurationSummary from "$lib/components/molecules/LibraryDurationSummary.svelte";
  import LibraryListView from "$lib/components/organisms/LibraryListView.svelte";
  import LibraryMapView from "$lib/components/organisms/LibraryMapView.svelte";
  import { Library } from "@lucide/svelte";
  import { library } from "$lib/core/library.svelte";
  import { player } from "$lib/core/player.svelte";
  import { cn } from "$lib/utils";
  import { ui } from "$lib/stores/ui.svelte";
  import { formatTimeAgo } from "$lib/utils/time";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  let now = $state(Date.now());

  onMount(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 15_000);
    return () => clearInterval(timer);
  });

  let relativeSyncLabel = $derived.by(() => {
    if (!library.lastSyncTime || !now) return "Never synced";
    return `Last updated ${formatTimeAgo(library.lastSyncTime)}`;
  });

  // Total duration of current filtered view
  let filteredDuration = $derived(
    library.displayedTracks.reduce((acc, t) => acc + (t.duration ?? 0), 0)
  );

  const queuedTrackIds = $derived(new Set(player.queue.map((t) => t.id)));

  async function handleTagAll(tag: string) {
    if (library.displayedTracks.length === 0 || !tag) return;
    const targetIds = library.displayedTracks.map((t) => t.id);
    await library.addTagToTracks(targetIds, tag);
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <HeaderBanner title="Library" icon={Library} />
  <div class="flex flex-col w-full gap-3 shrink-0">
    <div
      class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2"
    >
      <CommandBar deck="curate"/>

      <div
        class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end"
      >
        <div class="flex items-center gap-2 text-xs text-muted-foreground">
          <span class="size-2 rounded-full bg-secondary-foreground animate-pulse"></span>
          <span>{relativeSyncLabel}</span>
        </div>
        <LibraryControls
          viewMode={ui.libraryView}
          disabled={library.displayedTracks.length === 0}
          onViewChange={ui.setLibraryView}
          onTagAll={handleTagAll}
          onEnqueueAll={library.enqueueAllFiltered}
        />
      </div>
    </div>
  </div>

  <!-- Canvas Body -->
  <div class="flex-1 min-h-0">
    {#if ui.libraryView === "list"}
      <LibraryListView {queuedTrackIds} />
    {:else}
      <LibraryMapView {queuedTrackIds} />
    {/if}
  </div>
  <LibraryDurationSummary
    trackCount={library.displayedTracks.length}
    totalDuration={filteredDuration}
  />
</div>
