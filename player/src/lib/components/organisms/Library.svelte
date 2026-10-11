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
  import { Library, Settings } from "@lucide/svelte";
  import { library } from "$lib/core/library.svelte";
  import { player } from "$lib/core/player.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import type { ParsedIntent } from "$lib/utils/commandParser";
  import { cn } from "$lib/utils";
  import ControlButton from "../atoms/ControlButton.svelte";

  interface Props {
    class?: string;
    openSettings?: () => void;
  }

  let { class: className = "", openSettings }: Props = $props();

  let viewMode = $state<LibraryViewMode>("list");

  // Total duration of current filtered view
  let filteredDuration = $derived(
    library.displayedTracks.reduce((acc, t) => acc + (t.duration ?? 0), 0)
  );

  const queuedTrackIds = $derived(new Set(player.queue.map((t) => t.id)));

  function handleSearchChange(intent: ParsedIntent) {
    if (
      intent.type === "agent_action" ||
      intent.type === "filter_action" ||
      intent.type === "autodj_constraint" ||
      intent.type === "setting_assignment"
    ) {
      // potentially clear library filter?
      return;
    }
    library.setFilter(intent);
  }

  function handleCommandSubmit(intent: ParsedIntent) {
    if (intent.type === "agent_action") {
      console.log(
        "Dispatching agent intent to Sinatra MCP:",
        intent.action,
        intent.prompt
      );
      // TODO: Trigger local LLM / MCP action hook here
      return;
    }
    if (intent.type === "setting_assignment") {
      let val = intent.value;
      if (val === "on") val = "true";
      if (val === "off") val = "false";

      settings.set(intent.key, val);
      return;
    }
    if (intent.type === "filter_action") {
      const matchingTracks = library.getFilteredTracks(intent.filter);
      if (intent.action === "play") {
        player.setQueue(matchingTracks, 0, true);
      } else {
        for (const track of matchingTracks) {
          player.enqueue(track);
        }
      }
      return;
    }
    if (intent.type === "autodj_constraint") {
      player.setAutoDjConstraint(intent.filter);
      return;
    }
    if (library.displayedTracks.length == 0) {
      player.setQueue(library.displayedTracks, 0, true);
      return;
    }
    handleEnqueueAll();
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
  <HeaderBanner title="Library" icon={Library}>
    <ControlButton
      icon={Settings}
      onClick={openSettings}
      label="Open Settings"
      title="Settings (Cmd+,)"
      class="size-4"
      iconClass="size-4"
    />
  </HeaderBanner>
  <div class="flex flex-col w-full gap-3 shrink-0">
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
