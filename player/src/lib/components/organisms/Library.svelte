<!-- src/lib/components/organisms/Library.svelte -->
<script lang="ts">
  import HeaderBanner from "$lib/components/molecules/HeaderBanner.svelte";
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import LibraryControls, {
    type LibraryViewMode,
  } from "$lib/components/molecules/LibraryControls.svelte";
  import LibraryDurationSummary from "$lib/components/molecules/LibraryDurationSummary.svelte";
  import LibraryListView from "$lib/components/organisms/LibraryListView.svelte";
  import LibraryMapView from "$lib/components/organisms/LibraryMapView.svelte";
  import { Library } from "@lucide/svelte";
  import { library } from "$lib/audio/library.svelte";
  import { player } from "$lib/audio/player.svelte";
  import type { ParsedIntent } from "$lib/utils/commandParser";
  import { cn } from "$lib/utils";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  let viewMode = $state<LibraryViewMode>("list");

  // Total duration of current filtered view
  let filteredDuration = $derived(
    library.displayedTracks.reduce((acc, t) => acc + (t.duration ?? 0), 0)
  );

  const queuedTrackIds = $derived(new Set(player.queue.map((t) => t.id)));

  function handleSearchChange(intent: ParsedIntent) {
    if (intent.type === "text_search") {
      library.setFilter(intent.query, "all");
    } else if (intent.type === "column_filter") {
      library.setFilter(intent.query, intent.column);
    }
  }

  function handleCommandSubmit(intent: ParsedIntent) {
    if (intent.type === "command") {
      console.log(
        "Dispatching agent intent to Sinatra MCP:",
        intent.command,
        intent.prompt
      );
      // Trigger local LLM / MCP action hook here
    } else if (library.displayedTracks.length > 0) {
      // Pressing Enter on pure searches loads current search view into queue
      player.setQueue(library.displayedTracks, 0, true);
    }
  }

  async function handleTagAll(tag: string) {
    if (library.displayedTracks.length === 0 || !tag) return;
    const targetIds = library.displayedTracks.map((t) => t.id);
    await library.addTagToTracks(targetIds, tag);
  }

  function handleEnqueueAll() {
    for (const track of library.displayedTracks) {
      player.enqueue(track);
    }
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden",
    className
  )}
>
  <HeaderBanner title="Library" icon={Library} />
  <div class="flex flex-col w-full gap-3 shrink-0">
    <!-- Header Bar: Command Search (Center) + Controls & Summary (Right) -->
    <div
      class="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-2"
    >
      <CommandBar
        onSearchChange={handleSearchChange}
        onCommandSubmit={handleCommandSubmit}
      />

      <div
        class="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end"
      >
        <LibraryControls
          {viewMode}
          disabled={library.displayedTracks.length === 0}
          onViewChange={(mode) => (viewMode = mode)}
          onTagAll={handleTagAll}
          onEnqueueAll={handleEnqueueAll}
        />
      </div>
    </div>
  </div>

  <!-- Canvas Body -->
  <div class="flex-1 min-h-0">
    {#if viewMode === "list"}
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
