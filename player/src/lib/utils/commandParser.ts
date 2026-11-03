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
  | { type: "lyrics_filter"; query: string }
  | { type: "emotion_filter"; query: string }
  | { type: "queued_filter"; filter: FilterIntent }
  | { type: "text_search"; query: string };

export type SearchType = "song" | "artist" | "album" | "mood"

export type SearchIntent = {
  type: SearchType;
  query: string;
};

export type ParsedIntent =
  | { type: "agent_action"; action: "play" | "queue"; prompt: string }
  | { type: "filter_action"; action: "play" | "queue"; filter: FilterIntent }
  | { type: "search_action"; action: "search"; filter: SearchIntent }
  | { type: "autodj_constraint"; filter: FilterIntent }
  | { type: "setting_assignment"; key: string; value: string }
  | FilterIntent;

const nullCommand: FilterIntent = { type: "text_search", query: "" };

/**
 * Parses search commands starting with '/s' (or '/search').
 * Supports:
 *   - Direct query: "/s Comfortably Numb" -> { type: "song", query: "Comfortably Numb" }
 *   - Explicit prefix: "/s :artist Pink Floyd" -> { type: "artist", query: "Pink Floyd" }
 *   - Entity targets: :song, :artist, :album, :mood
 */
export function parseSearchCommand(input: string): SearchIntent | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let target = trimmed;
  if (trimmed.startsWith("/")) {
    const cmdMatch = trimmed.match(/^\/s(?:earch)?(?:\s+(.*)|$)/i);
    if (!cmdMatch) return null;
    target = cmdMatch[1]?.trim() || "";
  }

  const prefixMatch = target.match(/^:(song|artist|album|mood)(?:\s+(.*)|$)/i);
  if (prefixMatch) {
    const type = prefixMatch[1].toLowerCase() as SearchIntent["type"];
    const query = prefixMatch[2]?.trim() || "";
    return { type, query };
  }

  return {
    type: "song",
    query: target,
  };
}

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

      if (prefix === "lyrics" || prefix === "lyric") {
        return {
          type: "lyrics_filter",
          query: rest,
        };
      }

      if (prefix === "emotions" || prefix === "emotion") {
        return {
          type: "emotion_filter",
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
              seconds,
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

  if (cmd === "set") {
    const [settingKey, ...valTokens] = rest.split(/\s+/);
    return {
      type: "setting_assignment",
      key: settingKey ?? "",
      value: valTokens.join(" ").trim(),
    };
  }

  if (cmd === "dj" || cmd === "autodj") {
    return {
      type: "autodj_constraint",
      filter: parseFilterCommand(rest),
    };
  }

  let action;

  if (cmd === "p" || cmd === "play") {
    action = "play";
  }

  if (cmd === "q" || cmd === "queue") {
    action = "queue";
  }

  if (cmd === "s" || cmd === "search") {
    const filter = parseSearchCommand(rest)
    return filter ? {
      type: "search_action",
      action: "search",
      filter,
    } : nullCommand;
  }

  if (action === "play" || action === "queue") {
    if (rest.startsWith(":")) {
      return {
        type: "filter_action",
        action,
        filter: parseFilterCommand(rest),
      };
    }
    return {
      type: "agent_action",
      action,
      prompt: rest,
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
