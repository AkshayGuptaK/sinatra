import { library } from "$lib/core/library.svelte";
import { player } from "$lib/core/player.svelte";
import { settings } from "$lib/core/settings.svelte";
import type { ParsedIntent } from "$lib/utils/commandParser";

export function handleSearchChange(intent: ParsedIntent) {
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

export function handleCommandSubmit(intent: ParsedIntent) {
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

export function handleEnqueueAll() {
  for (const track of library.displayedTracks) {
    player.enqueue(track);
  }
}
