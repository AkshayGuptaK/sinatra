import type { FilterableField } from "$lib/types/metadata";
import { parseDurationToSeconds } from "./time";

export type ComparisonOperator = ">" | "<" | ">=" | "<=";

export type FilterIntent =
  | { type: "column_filter"; column: FilterableField; query: string }
  | {
      type: "duration_filter";
      operator: ComparisonOperator;
      seconds: number;
    }
  | { type: "queued_filter"; filter: FilterIntent }
  | { type: "text_search"; query: string };

export type ParsedIntent =
  | { type: "action_command"; action: "play" | "queue"; prompt: string }
  | { type: "autodj_constraint"; filter: FilterIntent }
  | FilterIntent;

const nullCommand: FilterIntent = { type: "text_search", query: "" };

/**
 * Recursively parses a filter expression.
 * Supports:
 * - Bare text: "turtle" -> text_search
 * - Column filter: ":tag light rock" -> column_filter
 * - Nested queued filter: ":q :tag rock", ":q turtle", ":q" -> queued_filter
 */
export function parseFilterCommand(input: string): FilterIntent {
  if (!input) return nullCommand;

  if (input.startsWith(":")) {
    const match = input.match(/^:([a-zA-Z]+)\s*(.*)$/);
    if (match) {
      const prefix = match[1].toLowerCase();
      const rest = match[2]?.trim() || "";

      if (prefix === "q" || prefix === "queued") {
        return {
          type: "queued_filter",
          filter: parseFilterCommand(rest),
        };
      }

      if (["artist", "album", "mood", "title", "tags"].includes(prefix)) {
        return {
          type: "column_filter",
          column: prefix as FilterableField,
          query: rest,
        };
      }
      // Alias tag to tags
      if (prefix === "tag") {
        return {
          type: "column_filter",
          column: "tags",
          query: rest,
        };
      }

      if (prefix === "duration") {
        const opMatch = rest.match(/^(>=|<=|>|<)\s*(.+)$/);
        if (opMatch) {
          const operator = opMatch[1] as ComparisonOperator;
          const timeStr = opMatch[2].trim();
          const seconds = parseDurationToSeconds(timeStr);

          if (seconds !== null) {
            return {
              type: "duration_filter",
              operator,
              seconds
            };
          }
        }
      }
    }
  }
  return { type: "text_search", query: input };
}

/**
 * Parses action commands starting with '/'
 */
export function parseActionCommand(input: string): ParsedIntent {
  const parts = input.slice(1).split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const rest = parts.slice(1).join(" ").trim();

  if (cmd === "p" || cmd === "play") {
    return { type: "action_command", action: "play", prompt: rest };
  }

  if (cmd === "q" || cmd === "queue") {
    return { type: "action_command", action: "queue", prompt: rest };
  }

  if (cmd === "dj" || cmd === "autodj") {
    return {
      type: "autodj_constraint",
      filter: parseFilterCommand(rest),
    };
  }
  return nullCommand;
}

export function parseCommandInput(input: string): ParsedIntent {
  const trimmed = input.trim();

  if (trimmed.startsWith("/")) {
    return parseActionCommand(trimmed);
  }

  return parseFilterCommand(trimmed);
}
