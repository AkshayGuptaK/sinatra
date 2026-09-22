<!-- src/lib/components/organisms/Library.svelte -->
<script lang="ts">
  import CommandBar from "$lib/components/molecules/CommandBar.svelte";
  import LibraryControls, {
    type LibraryViewMode,
  } from "$lib/components/molecules/LibraryControls.svelte";
  import LibraryDurationSummary from "$lib/components/molecules/LibraryDurationSummary.svelte";
  import LibraryListView from "$lib/components/organisms/LibraryListView.svelte";
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
    library.filteredTracks.reduce((acc, t) => acc + (t.duration ?? 0), 0)
  );

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
    } else if (library.filteredTracks.length > 0) {
      // Pressing Enter on pure searches loads current search view into queue
      player.setQueue(library.filteredTracks, 0, true);
    }
  }

  function handleEnqueueAll() {
    for (const track of library.filteredTracks) {
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
  <div
    class="flex items-center gap-2 px-4 py-3 border-b bg-muted/20 select-none shrink-0"
  >
    <Library class="size-4 text-muted-foreground" />
    <h2
      class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
    >
      Library
    </h2>
  </div>
  <div class={cn("flex flex-col w-full h-full min-h-0 gap-3", className)}>
    <!-- Header Bar: Command Search (Center) + Controls & Summary (Right) -->
    <div
      class="flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-2"
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
          disabled={library.filteredTracks.length === 0}
          onViewChange={(mode) => (viewMode = mode)}
          onEnqueueAll={handleEnqueueAll}
        />
      </div>
    </div>
  </div>

  <!-- Canvas Body -->
  <div class="flex-1 min-h-0">
    {#if viewMode === "list"}
      <LibraryListView />
    {:else}
      <div
        class="flex flex-col items-center justify-center h-full border rounded-xl bg-card text-muted-foreground"
      >
        <p class="text-sm">Mood Scatter Map Canvas will mount here.</p>
      </div>
    {/if}
  </div>
  <LibraryDurationSummary
    trackCount={library.filteredTracks.length}
    totalDuration={filteredDuration}
  />
</div>
