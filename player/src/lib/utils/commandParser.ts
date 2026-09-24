import type { FilterableField } from "$lib/types/metadata";

export type ParsedIntent =
  | { type: "command"; command: "play" | "queue"; prompt: string }
  | { type: "column_filter"; column: FilterableField; query: string }
  | { type: "text_search"; query: string };

export function parseCommandInput(input: string): ParsedIntent {
  const trimmed = input.trim();

  // 1. Natural Language / Agent Commands: /play, /q, /queue
  if (trimmed.startsWith("/")) {
    const parts = trimmed.slice(1).split(/\s+/);
    const cmd = parts[0]?.toLowerCase();
    const prompt = parts.slice(1).join(" ");

    if (cmd === "p" || cmd === "play")
      return { type: "command", command: "play", prompt };
    if (cmd === "q" || cmd === "queue")
      return { type: "command", command: "queue", prompt };
  }

  // 2. Explicit Column Filters: :artist Sinatra, :mood calm
  if (trimmed.startsWith(":")) {
    const match = trimmed.match(/^:([a-zA-Z]+)\s*(.*)$/);
    if (match) {
      const col = match[1].toLowerCase();
      const query = match[2] || "";
      if (["artist", "album", "mood", "title", "tags"].includes(col)) {
        return {
          type: "column_filter",
          column: col as FilterableField,
          query,
        };
      }
      if (col === "tag") {
        return { type: "column_filter", column: "tags", query };
      }
    }
  }
  return { type: "text_search", query: trimmed };
}
