import { library } from "$lib/core/library.svelte";
import { player } from "$lib/core/player.svelte";
import { ui } from "$lib/stores/ui.svelte";
import { executeCommand } from "$lib/config/commandRegistry";
import { isNullFilter, type ParsedInput } from "$lib/utils/commandParser";

export function handleFilterChange(input: ParsedInput) {
  if (input.type === "command") {
    return;
  }
  if (!isNullFilter(input)) ui.setDeck("curate");
  library.setFilter(input);
}

export function handleCommandSubmit(input: ParsedInput) {
  if (input.type === "command") {
    const executed = executeCommand(input.name, {
      rawArgs: input.rawArgs,
      filter: input.filter,
    });
    if (!executed) {
      console.warn(`Unknown command: /${input.name}`);
    }
    return;
  }

  if (library.displayedTracks.length === 0) {
    player.setQueue(library.displayedTracks, 0, true);
    return;
  }
  library.enqueueAllFiltered();
}
