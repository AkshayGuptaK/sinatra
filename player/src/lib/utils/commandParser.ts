import type { FilterableField } from "$lib/types/metadata";
import { parseDurationToSeconds } from "./time";

export type ComparisonOperator = ">" | "<" | ">=" | "<=";

export type FilterIntent =
  | { type: "and"; left: FilterIntent; right: FilterIntent }
  | { type: "or"; left: FilterIntent; right: FilterIntent }
  | { type: "not"; operand: FilterIntent }
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

export type SearchType = "song" | "artist" | "album" | "mood";

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
 * - Direct query: "/s Comfortably Numb" -> { type: "song", query: "Comfortably Numb" }
 * - Explicit prefix: "/s :artist Pink Floyd" -> { type: "artist", query: "Pink Floyd" }
 * - Entity targets: :song, :artist, :album, :mood
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

// ============================================================================
// Boolean Filter Lexer & Recursive Descent Parser
// ============================================================================

type FilterToken =
  | { type: "LPAREN" }
  | { type: "RPAREN" }
  | { type: "AND" }
  | { type: "OR" }
  | { type: "NOT" }
  | { type: "PREFIX"; name: string }
  | { type: "WORD"; value: string; quoted?: boolean };

/**
 * Tokenizes a filter input string into structural boolean tokens,
 * filter prefixes (e.g. `:artist`), and words/phrases.
 */
function tokenizeFilter(input: string): FilterToken[] {
  const tokens: FilterToken[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    // 1. Skip whitespace
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

    // 2. Parentheses
    if (input[i] === "(") {
      tokens.push({ type: "LPAREN" });
      i++;
      continue;
    }
    if (input[i] === ")") {
      tokens.push({ type: "RPAREN" });
      i++;
      continue;
    }

    // 3. Quoted strings (preserves spaces and escapes boolean keywords)
    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      let start = i;
      i++; // skip opening quote
      while (i < len && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < len) i++;
        i++;
      }
      if (i < len) i++; // include closing quote
      tokens.push({
        type: "WORD",
        value: input.slice(start, i),
        quoted: true,
      });
      continue;
    }

    // 4. Read contiguous non-whitespace, non-paren segment
    let start = i;
    while (
      i < len &&
      !/\s/.test(input[i]) &&
      input[i] !== "(" &&
      input[i] !== ")"
    ) {
      if (input[i] === '"' || input[i] === "'") {
        const q = input[i++];
        while (i < len && input[i] !== q) i++;
        if (i < len) i++;
      } else {
        i++;
      }
    }

    const rawWord = input.slice(start, i);
    const lower = rawWord.toLowerCase();

    // 5. Shorthand negation prefix `!:tag` or `-:tag` or `!(...)`
    if ((rawWord === "!" || rawWord === "-") && i < len && input[i] === "(") {
      tokens.push({ type: "NOT" });
      continue;
    }
    if (
      (rawWord.startsWith("-:") || rawWord.startsWith("!:")) &&
      rawWord.length > 2
    ) {
      const prefixName = rawWord.slice(2).toLowerCase();
      if (/^[a-z]+$/.test(prefixName)) {
        tokens.push({ type: "NOT" });
        tokens.push({ type: "PREFIX", name: prefixName });
        continue;
      }
    }

    // 6. Filter prefix `:artist`, `:q`, `:d`, etc. (ignores time strings like `3:00`)
    if (rawWord.startsWith(":") && /^[a-zA-Z]+$/.test(rawWord.slice(1))) {
      tokens.push({ type: "PREFIX", name: rawWord.slice(1).toLowerCase() });
      continue;
    }

    // 7. Boolean operators
    if (lower === "and" || lower === "&&") {
      tokens.push({ type: "AND" });
      continue;
    }
    if (lower === "or" || lower === "||") {
      tokens.push({ type: "OR" });
      continue;
    }
    if (lower === "not" || rawWord === "!") {
      tokens.push({ type: "NOT" });
      continue;
    }

    // 8. Standard word / comparator / value
    tokens.push({ type: "WORD", value: rawWord });
  }

  return tokens;
}

/**
 * Strips outer quotes for standard metadata comparisons while keeping
 * inner content intact.
 */
function stripOuterQuotes(str: string): string {
  const trimmed = str.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

/**
 * Constructs a leaf FilterIntent from a prefix name and its argument string.
 */
function buildPrefixLeafFilter(prefix: string, rawArg: string): FilterIntent {
  const cleanArg = stripOuterQuotes(rawArg);

  if (["artist", "album", "mood", "title", "tags"].includes(prefix)) {
    return {
      type: "column_filter",
      column: prefix as FilterableField,
      query: cleanArg,
    };
  }

  if (prefix === "tag") {
    return {
      type: "column_filter",
      column: "tags",
      query: cleanArg,
    };
  }

  if (prefix === "lyrics" || prefix === "lyric") {
    // Keep rawArg so quoted phrases like `"had enough"` reach the lyrics endpoint
    return {
      type: "lyrics_filter",
      query: rawArg.trim(),
    };
  }

  if (prefix === "emotions" || prefix === "emotion") {
    return {
      type: "emotion_filter",
      query: cleanArg,
    };
  }

  if (prefix === "duration" || prefix === "dur" || prefix === "d") {
    const opMatch = cleanArg.match(/^(>=|<=|>|<)\s*(.+)$/);
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

  // Fallback for unknown `:prefix` -> treat as text search
  return {
    type: "text_search",
    query: rawArg ? `:${prefix} ${cleanArg}` : `:${prefix}`,
  };
}

/**
 * Recursively parses a filter expression with full support for:
 * - Boolean operators: `and`, `or`, `not` (plus `&&`, `||`, `!`, `-:tag`)
 * - Parentheses grouping: `(:artist Enya or :artist Queen) and :d > 3m`
 * - Implicit AND: `:artist Enya :tag calm`
 * - Nested queued filters: `:q (:tag rock or :tag pop)`
 */
export function parseFilterCommand(input: string): FilterIntent {
  const trimmed = input.trim();
  if (!trimmed) return nullCommand;

  const tokens = tokenizeFilter(trimmed);
  if (tokens.length === 0) return nullCommand;

  let pos = 0;

  function peek(): FilterToken | undefined {
    return tokens[pos];
  }

  function consume(): FilterToken {
    return tokens[pos++];
  }

  // Lowest Precedence: OR
  function parseOr(): FilterIntent {
    let left = parseAnd();

    while (peek()?.type === "OR") {
      consume(); // consume OR
      if (pos >= tokens.length || peek()?.type === "RPAREN") break; // trailing 'or' while typing
      const right = parseAnd();
      left = { type: "or", left, right };
    }

    return left;
  }

  // Medium Precedence: AND (explicit `and` or implicit adjacency)
  function parseAnd(): FilterIntent {
    let left = parseUnary();

    while (pos < tokens.length) {
      const next = peek();
      if (!next || next.type === "OR" || next.type === "RPAREN") {
        break;
      }

      if (next.type === "AND") {
        consume(); // consume explicit AND
        if (pos >= tokens.length || peek()?.type === "RPAREN") break; // trailing 'and' while typing
      }

      const right = parseUnary();
      left = { type: "and", left, right };
    }

    return left;
  }

  // Highest Precedence: NOT, :q, Parentheses, and Leaf Filters
  function parseUnary(): FilterIntent {
    const next = peek();

    // 1. Unary NOT
    if (next?.type === "NOT") {
      consume();
      if (pos >= tokens.length || peek()?.type === "RPAREN") {
        return nullCommand;
      }
      return { type: "not", operand: parseUnary() };
    }

    // 2. Parenthesized sub-expression `(...)`
    if (next?.type === "LPAREN") {
      consume(); // consume '('
      if (peek()?.type === "RPAREN") {
        consume();
        return nullCommand;
      }
      const expr = parseOr();
      if (peek()?.type === "RPAREN") {
        consume(); // consume ')'
      }
      return expr;
    }

    // 3. Prefix Filter (`:artist`, `:q`, `:d`, etc.)
    if (next?.type === "PREFIX") {
      const prefixToken = consume() as { type: "PREFIX"; name: string };
      const prefix = prefixToken.name;

      // Queued filter `:q` / `:queued` wraps the next unary filter or group
      if (prefix === "q" || prefix === "queued") {
        const nextTok = peek();
        if (
          !nextTok ||
          nextTok.type === "AND" ||
          nextTok.type === "OR" ||
          nextTok.type === "RPAREN"
        ) {
          return { type: "queued_filter", filter: nullCommand };
        }
        return {
          type: "queued_filter",
          filter: parseUnary(),
        };
      }

      // Consume all contiguous WORD tokens belonging to this prefix's query
      const words: string[] = [];
      while (peek()?.type === "WORD") {
        words.push((consume() as { type: "WORD"; value: string }).value);
      }

      return buildPrefixLeafFilter(prefix, words.join(" "));
    }

    // 4. Bare Text Search (consumes contiguous WORD tokens until next operator/prefix)
    if (next?.type === "WORD") {
      const words: string[] = [];
      while (peek()?.type === "WORD") {
        words.push(
          stripOuterQuotes((consume() as { type: "WORD"; value: string }).value)
        );
      }
      return { type: "text_search", query: words.join(" ") };
    }

    // 5. Graceful fallback for stray closing parens or incomplete syntax while typing
    consume();
    return pos < tokens.length ? parseUnary() : nullCommand;
  }

  return parseOr();
}

/**
 * Checks whether a trailing argument string in `/p` or `/q` should be
 * executed locally as a structured FilterIntent rather than sent to the MCP agent.
 */
function isStructuredFilterExpression(rest: string): boolean {
  const trimmed = rest.trim();
  return (
    trimmed.startsWith(":") ||
    trimmed.startsWith("-:") ||
    trimmed.startsWith("!:") ||
    trimmed.startsWith("(") ||
    /^not\s+[:(]/i.test(trimmed)
  );
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

  let action: "play" | "queue" | undefined;

  if (cmd === "p" || cmd === "play") {
    action = "play";
  }

  if (cmd === "q" || cmd === "queue") {
    action = "queue";
  }

  if (cmd === "s" || cmd === "search") {
    const filter = parseSearchCommand(rest);
    return filter
      ? {
          type: "search_action",
          action: "search",
          filter,
        }
      : nullCommand;
  }

  if (action === "play" || action === "queue") {
    if (isStructuredFilterExpression(rest)) {
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
