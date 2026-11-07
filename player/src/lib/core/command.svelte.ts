import { library } from "$lib/core/library.svelte";
import { player } from "$lib/core/player.svelte";
import { executeCommand } from "$lib/config/commandRegistry";
import type { ParsedInput } from "$lib/utils/commandParser";

export function handleFilterChange(input: ParsedInput) {
  if (input.type === "command") {
    return;
  }
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
  handleEnqueueAll();
}

export function handleEnqueueAll() {
  for (const track of library.displayedTracks) {
    player.enqueue(track);
  }
}
