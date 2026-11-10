import type { FilterableField } from "$lib/types/metadata";
import { parseDurationToSeconds } from "./time";

export type ComparisonOperator = ">" | "<" | ">=" | "<=";

// Boolean Filter AST
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

export interface RandomActionDirective {
  isRandom: boolean;
  count: number;
  filter?: FilterIntent;
  remainingText: string;
}

// Generic Command Invocation
export interface ParsedCommand {
  type: "command";
  name: string;
  rawArgs: string;
  filter?: FilterIntent;
}

export type ParsedInput = ParsedCommand | FilterIntent;

const nullFilter: FilterIntent = { type: "text_search", query: "" };

export function isNullFilter(filter: FilterIntent) {
  return filter.type === 'text_search' && filter.query === ""
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

function tokenizeFilter(input: string): FilterToken[] {
  const tokens: FilterToken[] = [];
  let i = 0;
  const len = input.length;

  while (i < len) {
    if (/\s/.test(input[i])) {
      i++;
      continue;
    }

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

    if (input[i] === '"' || input[i] === "'") {
      const quote = input[i];
      let start = i;
      i++;
      while (i < len && input[i] !== quote) {
        if (input[i] === "\\" && i + 1 < len) i++;
        i++;
      }
      if (i < len) i++;
      tokens.push({
        type: "WORD",
        value: input.slice(start, i),
        quoted: true,
      });
      continue;
    }

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

    if (rawWord.startsWith(":") && /^[a-zA-Z]+$/.test(rawWord.slice(1))) {
      tokens.push({ type: "PREFIX", name: rawWord.slice(1).toLowerCase() });
      continue;
    }

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

    tokens.push({ type: "WORD", value: rawWord });
  }

  return tokens;
}

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

  return {
    type: "text_search",
    query: rawArg ? `:${prefix} ${cleanArg}` : `:${prefix}`,
  };
}

export function parseFilterCommand(input: string): FilterIntent {
  const trimmed = input.trim();
  if (!trimmed) return nullFilter;

  const tokens = tokenizeFilter(trimmed);
  if (tokens.length === 0) return nullFilter;

  let pos = 0;

  function peek(): FilterToken | undefined {
    return tokens[pos];
  }

  function consume(): FilterToken {
    return tokens[pos++];
  }

  function parseOr(): FilterIntent {
    let left = parseAnd();

    while (peek()?.type === "OR") {
      consume();
      if (pos >= tokens.length || peek()?.type === "RPAREN") break;
      const right = parseAnd();
      left = { type: "or", left, right };
    }

    return left;
  }

  function parseAnd(): FilterIntent {
    let left = parseUnary();

    while (pos < tokens.length) {
      const next = peek();
      if (!next || next.type === "OR" || next.type === "RPAREN") break;

      if (next.type === "AND") {
        consume();
        if (pos >= tokens.length || peek()?.type === "RPAREN") break;
      }

      const right = parseUnary();
      left = { type: "and", left, right };
    }

    return left;
  }

  function parseUnary(): FilterIntent {
    const next = peek();

    if (next?.type === "NOT") {
      consume();
      if (pos >= tokens.length || peek()?.type === "RPAREN") return nullFilter;
      return { type: "not", operand: parseUnary() };
    }

    if (next?.type === "LPAREN") {
      consume();
      if (peek()?.type === "RPAREN") {
        consume();
        return nullFilter;
      }
      const expr = parseOr();
      if (peek()?.type === "RPAREN") consume();
      return expr;
    }

    if (next?.type === "PREFIX") {
      const prefixToken = consume() as { type: "PREFIX"; name: string };
      const prefix = prefixToken.name;

      if (prefix === "q" || prefix === "queued") {
        const nextTok = peek();
        if (
          !nextTok ||
          nextTok.type === "AND" ||
          nextTok.type === "OR" ||
          nextTok.type === "RPAREN"
        ) {
          return { type: "queued_filter", filter: nullFilter };
        }
        return {
          type: "queued_filter",
          filter: parseUnary(),
        };
      }

      const words: string[] = [];
      while (peek()?.type === "WORD") {
        words.push((consume() as { type: "WORD"; value: string }).value);
      }

      return buildPrefixLeafFilter(prefix, words.join(" "));
    }

    if (next?.type === "WORD") {
      const words: string[] = [];
      while (peek()?.type === "WORD") {
        words.push(
          stripOuterQuotes((consume() as { type: "WORD"; value: string }).value)
        );
      }
      return { type: "text_search", query: words.join(" ") };
    }

    consume();
    return pos < tokens.length ? parseUnary() : nullFilter;
  }

  return parseOr();
}

/**
 * Checks whether an argument string starts with a structured filter syntax.
 */
export function isStructuredFilterExpression(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith(":") ||
    trimmed.startsWith("-:") ||
    trimmed.startsWith("!:") ||
    trimmed.startsWith("(") ||
    /^not\s+[:(]/i.test(trimmed)
  );
}

/**
 * Checks for a 'random' or 'rand' modifier in play/queue arguments.
 * Syntax: "random [count] [:filter]"
 */
export function parseRandomDirective(rawArgs: string): RandomActionDirective {
  const trimmed = rawArgs.trim();
  const match = trimmed.match(/^(?:random|rand)(?:\s+(\d+))?(?:\s+(.*))?$/i);

  if (!match) {
    return {
      isRandom: false,
      count: 1,
      remainingText: trimmed,
    };
  }

  const count = match[1] ? Math.max(1, parseInt(match[1], 10)) : 1;
  const trailing = match[2]?.trim() || "";

  return {
    isRandom: true,
    count,
    filter: trailing ? parseFilterCommand(trailing) : undefined,
    remainingText: trailing,
  };
}

/**
 * Top-level entry point. Decides only whether input is a command (`/`)
 * or a filter expression, parsing nested filters if present.
 */
export function parseCommandInput(input: string): ParsedInput {
  const trimmed = input.trim();

  if (trimmed.startsWith("/")) {
    const body = trimmed.slice(1);
    const firstSpace = body.search(/\s/);
    const name = (
      firstSpace === -1 ? body : body.slice(0, firstSpace)
    ).toLowerCase();
    const rawArgs = firstSpace === -1 ? "" : body.slice(firstSpace).trim();

    let filter: FilterIntent | undefined;
    if (rawArgs && isStructuredFilterExpression(rawArgs)) {
      filter = parseFilterCommand(rawArgs);
    }

    return {
      type: "command",
      name,
      rawArgs,
      filter,
    };
  }

  return parseFilterCommand(trimmed);
}
