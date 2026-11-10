import {
  ui,
  type AppDeck,
  type LibraryViewMode,
  type VisualizerViewMode,
} from "$lib/stores/ui.svelte";
import { player } from "$lib/core/player.svelte";
import { library } from "$lib/core/library.svelte";
import { explorer } from "$lib/core/explorer.svelte";
import { settings } from "$lib/core/settings.svelte";
import { SETTINGS_DEFINITIONS } from "$lib/config/settingsRegistry";
import {
  parseFilterCommand,
  parseRandomDirective,
  type FilterIntent,
} from "$lib/utils/commandParser";

export type CommandCategory =
  | "Playback"
  | "Navigation"
  | "Queue"
  | "AutoDJ"
  | "Settings"
  | "Explore";

export type SearchType = 
| "song"
| "artist"
| "album"
| "mood";

export interface SearchIntent {
  type: SearchType;
  query: string;
}

export interface CommandContext {
  rawArgs: string;
  filter?: FilterIntent;
}

export interface CommandSuggestion {
  prefix: string;
  label: string;
  desc: string;
  shortcut?: string;
}

export interface AppCommand {
  id: string;
  name: string;
  label: string;
  desc: string;
  category: CommandCategory;
  shortcut?: string;
  aliases?: string[];
  getSuggestions?: (rawArgs: string) => CommandSuggestion[];
  execute: (ctx: CommandContext) => void | Promise<void>;
}

export const COMMAND_REGISTRY: AppCommand[] = [
  // --- Navigation & Display ---
  {
    id: "deck.switch",
    name: "deck",
    label: "/deck <curate|explore|vibe|settings>",
    desc: "Switch active deck",
    category: "Navigation",
    getSuggestions: (rawArgs) => {
      const target = rawArgs.toLowerCase().trim();
      const options = [
        {
          target: "curate",
          label: "/deck curate",
          desc: "Switch to Curate workspace (library & queue)",
        },
        {
          target: "explore",
          label: "/deck explore",
          desc: "Switch to Explore catalog workspace",
        },
        {
          target: "vibe",
          label: "/deck vibe",
          desc: "Switch to Vibe mood & visualizer stage",
        },
        {
          target: "settings",
          label: "/deck settings",
          desc: "Open Settings dialog",
        },
      ];
      return options
        .filter((o) => o.target.startsWith(target))
        .map((o) => ({
          prefix: `/deck ${o.target}`,
          label: o.label,
          desc: o.desc,
        }));
    },
    execute: ({ rawArgs }) => {
      const target = rawArgs.toLowerCase().trim() as AppDeck;
      if (["curate", "explore", "vibe", "settings"].includes(target)) {
        ui.setDeck(target);
      }
    },
  },
  {
    id: "view.switch",
    name: "view",
    label: "/view <list|map|timeline|fluid>",
    desc: "Switch active view",
    category: "Navigation",
    getSuggestions: (rawArgs) => {
      const target = rawArgs.toLowerCase().trim();
      const options = [
        {
          target: "list",
          label: "/view list",
          desc: "Switch Curate library to table list view",
        },
        {
          target: "map",
          label: "/view map",
          desc: "Switch Curate library to 2D Mood Map canvas",
        },
        {
          target: "timeline",
          label: "/view timeline",
          desc: "Switch Vibe to affective timeline & segment scrubber",
        },
        {
          target: "fluid",
          label: "/view fluid",
          desc: "Switch Vibe to fluid particle visualizer",
        },
      ];
      return options
        .filter((o) => o.target.startsWith(target))
        .map((o) => ({
          prefix: `/view ${o.target}`,
          label: o.label,
          desc: o.desc,
        }));
    },
    execute: ({ rawArgs }) => {
      const target = rawArgs?.toLowerCase().trim() || "";
      if (["list", "map"].includes(target)) {
        ui.setLibraryView(target as LibraryViewMode);
      } else if (["timeline", "fluid"].includes(target)) {
        ui.setVisualizerView(target as VisualizerViewMode);
      }
    },
  },
  {
    id: "ui.set",
    name: "ui",
    label: "/ui <lyrics>",
    desc: "Toggle UI elements",
    category: "Navigation",
    getSuggestions: (rawArgs) => {
      const target = rawArgs.toLowerCase().trim();
      const options = [
        {
          target: "lyrics",
          label: "/ui lyrics",
          desc: "Toggle lyrics drawer in Vibe view",
        },
      ];
      return options
        .filter((o) => o.target.startsWith(target))
        .map((o) => ({
          prefix: `/ui ${o.target}`,
          label: o.label,
          desc: o.desc,
        }));
    },
    execute: ({ rawArgs }) => {
      const target = rawArgs?.toLowerCase().trim() || "";
      if (target === "lyrics") ui.toggleLyrics();
    },
  },

  // --- Transport & Playback ---
  {
    id: "playback.resume",
    name: "resume",
    label: "/resume",
    desc: "Resume or toggle playback",
    category: "Playback",
    shortcut: "Space",
    execute: () => {
      if (player.currentIndex === -1 && library.displayedTracks.length > 0) {
        player.setQueue(library.displayedTracks, 0, true);
      } else {
        player.engine.play();
      }
    },
  },
  {
    id: "playback.pause",
    name: "pause",
    label: "/pause",
    desc: "Pause audio playback",
    category: "Playback",
    execute: () => player.engine.pause(),
  },
  {
    id: "playback.next",
    name: "next",
    label: "/next",
    desc: "Skip to next track",
    category: "Playback",
    shortcut: "Cmd+Right",
    aliases: ["skip"],
    execute: () => player.next(),
  },
  {
    id: "playback.prev",
    name: "prev",
    label: "/prev",
    desc: "Skip to previous track",
    category: "Playback",
    shortcut: "Cmd+Left",
    aliases: ["previous"],
    execute: () => player.previous(),
  },
  {
    id: "player.repeat",
    name: "repeat",
    label: "/repeat",
    desc: "Cycle loop mode (none -> all -> one)",
    category: "Playback",
    shortcut: "Cmd+R",
    aliases: ["loop"],
    execute: () => player.cycleLoopMode(),
  },

  // --- Queue Actions ---
  {
    id: "queue.shuffle",
    name: "shuffle",
    label: "/shuffle",
    desc: "Toggle queue shuffle",
    category: "Queue",
    shortcut: "Cmd+S",
    execute: () => player.toggleShuffle(),
  },
  {
    id: "queue.clear",
    name: "clear",
    label: "/clear",
    desc: "Clear active playback queue",
    category: "Queue",
    aliases: ["clear-queue"],
    execute: () => player.clearQueue(),
  },
  {
    id: "queue.enqueue_all",
    name: "enqueue-all",
    label: "/enqueue-all",
    desc: "Append all visible library tracks to active queue",
    category: "Queue",
    execute: library.enqueueAllFiltered,
  },
  {
    id: "queue.play",
    name: "play",
    label: "/play [random <n>] <filter|prompt>",
    desc: "Play matching tracks, optionally a random sample.",
    category: "Playback",
    shortcut: "Space",
    aliases: ["p"],
    getSuggestions: (rawArgs) => {
      const trimmed = rawArgs.trimStart().toLowerCase();
      const options: CommandSuggestion[] = [
        {
          prefix: "/play :artist",
          label: "/play :artist <name>",
          desc: "Play tracks by artist",
        },
        {
          prefix: "/play :album",
          label: "/play :album <name>",
          desc: "Play tracks from album",
        },
        {
          prefix: "/play :tag",
          label: "/play :tag <name>",
          desc: "Play tracks matching tag",
        },
        {
          prefix: "/play :emotion",
          label: "/play :emotion <name>",
          desc: "Play tracks matching acoustic emotion",
        },
        {
          prefix: "/play :d",
          label: "/play :d > 3m",
          desc: "Play tracks matching duration",
        },
        {
          prefix: "/play :lyrics",
          label: "/play :lyrics <phrase>",
          desc: "Play tracks matching lyrics",
        },
        {
          prefix: "/play random",
          label: "/play random",
          desc: "Play 1 random track from library",
        },
      ];
      if (!trimmed) return options;
      return options.filter((o) =>
        o.prefix.toLowerCase().startsWith(`/play ${trimmed}`)
      );
    },
    execute: ({ rawArgs, filter }) => {
      const randomDirective = parseRandomDirective(rawArgs);
      if (randomDirective.isRandom) {
        const tracks = library.getRandomTracks(
          randomDirective.count,
          randomDirective.filter
        );
        if (tracks.length > 0) {
          player.setQueue(tracks, 0, true);
        }
        return;
      }
      if (filter) {
        const matching = library.getFilteredTracks(filter);
        if (matching.length > 0) {
          player.setQueue(matching, 0, true);
        }
        return;
      }
      console.log("Dispatching agent play intent to Sinatra MCP:", rawArgs);
    },
  },
  {
    id: "queue.queue",
    name: "queue",
    label: "/queue <filter|prompt>",
    desc: "Enqueue matching tracks, or toggle queue drawer if empty",
    category: "Queue",
    aliases: ["q"],
    getSuggestions: (rawArgs) => {
      const trimmed = rawArgs.trimStart().toLowerCase();
      const options: CommandSuggestion[] = [
        {
          prefix: "/queue :artist",
          label: "/queue :artist <name>",
          desc: "Enqueue tracks by artist",
        },
        {
          prefix: "/queue :album",
          label: "/queue :album <name>",
          desc: "Enqueue tracks from album",
        },
        {
          prefix: "/queue :tag",
          label: "/queue :tag <name>",
          desc: "Enqueue tracks matching tag",
        },
        {
          prefix: "/queue :emotion",
          label: "/queue :emotion <name>",
          desc: "Enqueue tracks matching acoustic emotion",
        },
        {
          prefix: "/queue :d",
          label: "/queue :d > 3m",
          desc: "Enqueue tracks matching duration",
        },
        {
          prefix: "/queue :lyrics",
          label: "/queue :lyrics <phrase>",
          desc: "Enqueue tracks matching lyrics",
        },
        {
          prefix: "/queue random",
          label: "/queue random",
          desc: "Enqueue 1 random track from library",
        },
      ];
      if (!trimmed) return options;
      return options.filter((o) =>
        o.prefix.toLowerCase().startsWith(`/queue ${trimmed}`)
      );
    },
    execute: ({ rawArgs, filter }) => {
      const randomDirective = parseRandomDirective(rawArgs);
      if (randomDirective.isRandom) {
        const tracks = library.getRandomTracks(
          randomDirective.count,
          randomDirective.filter
        );
        for (const track of tracks) {
          player.enqueue(track);
        }
        return;
      }
      if (filter) {
        const matching = library.getFilteredTracks(filter);
        for (const track of matching) {
          player.enqueue(track);
        }
        return;
      }
      console.log("Dispatching agent queue intent to Sinatra MCP:", rawArgs);
    },
  },

  // --- AutoDJ ---
  {
    id: "autodj.constraint",
    name: "dj",
    label: "/dj <filter>",
    desc: "Set AutoDJ hard filter constraint (:tag, :mood, :d, boolean)",
    category: "AutoDJ",
    aliases: ["autodj"],
    getSuggestions: (rawArgs) => {
      const trimmed = rawArgs.trimStart().toLowerCase();
      const options: CommandSuggestion[] = [
        {
          prefix: "/dj :tag",
          label: "/dj :tag <name>",
          desc: "Constrain AutoDJ to tag",
        },
        {
          prefix: "/dj :artist",
          label: "/dj :artist <name>",
          desc: "Constrain AutoDJ to artist",
        },
        {
          prefix: "/dj :emotion",
          label: "/dj :emotion <name>",
          desc: "Constrain AutoDJ to acoustic emotion",
        },
        {
          prefix: "/dj :lyrics",
          label: "/dj :lyrics <phrase>",
          desc: "Constrain AutoDJ to lyric matches",
        },
        {
          prefix: "/dj :d",
          label: "/dj :d > 3m",
          desc: "Constrain AutoDJ to duration (>, <, >=, <=)",
        },
      ];
      if (!trimmed) return options;
      return options.filter((o) =>
        o.prefix.toLowerCase().startsWith(`/dj ${trimmed}`)
      );
    },
    execute: ({ rawArgs, filter }) => {
      const activeFilter = filter ?? parseFilterCommand(rawArgs);
      player.setAutoDjConstraint(activeFilter);
    },
  },

  // --- Explore & Search ---
  {
    id: "explore.search",
    name: "search",
    label: "/s <query|:artist|:album|:mood>",
    desc: "Search remote catalog or browse by entity",
    category: "Explore",
    aliases: ["s"],
    getSuggestions: (rawArgs) => {
      const trimmed = rawArgs.trimStart().toLowerCase();
      const prefixes: CommandSuggestion[] = [
        { prefix: "/s :song", label: "/s :song <title>", desc: "Search songs" },
        {
          prefix: "/s :artist",
          label: "/s :artist <name>",
          desc: "Search artists",
        },
        {
          prefix: "/s :album",
          label: "/s :album <title>",
          desc: "Search albums",
        },
        {
          prefix: "/s :mood",
          label: "/s :mood <cluster>",
          desc: "Browse mood playlists",
        },
      ];
      if (!trimmed) return prefixes;
      return prefixes.filter((p) =>
        p.prefix.toLowerCase().startsWith(`/s ${trimmed}`)
      );
    },
    execute: ({ rawArgs }) => {
      ui.setDeck("explore")
      const match = rawArgs.match(/^:(song|artist|album|mood)(?:\s+(.*)|$)/i);
      if (match) {
        const type = match[1].toLowerCase() as SearchType
        const query = match[2]?.trim() || "";
        return explorer.executeIntent({ type, query });
      }
      return explorer.executeIntent({ type: "song", query: rawArgs });
    },
  },

  // --- Settings ---
  {
    id: "settings.assignment",
    name: "set",
    label: "/set <key> <value>",
    desc: "Configure an application setting",
    category: "Settings",
    getSuggestions: (rawArgs) => {
      const parts = rawArgs.split(/\s+/);
      if (parts.length <= 1) {
        const keyPrefix = parts[0] ?? "";
        return SETTINGS_DEFINITIONS.filter((def) =>
          def.id.toLowerCase().startsWith(keyPrefix.toLowerCase())
        ).map((def) => ({
          prefix: `/set ${def.id}`,
          label: `/set ${def.id}`,
          desc: `[${def.category}] ${def.label} — ${def.description}`,
        }));
      }

      const targetKey = parts[0];
      const valPrefix = parts.slice(1).join(" ").toLowerCase();
      const def = SETTINGS_DEFINITIONS.find((d) => d.id === targetKey);
      if (!def) return [];

      if (def.type === "boolean") {
        return ["on", "off"]
          .filter((v) => v.startsWith(valPrefix))
          .map((v) => ({
            prefix: `/set ${def.id} ${v}`,
            label: `/set ${def.id} ${v}`,
            desc: v === "on" ? "Enable" : "Disable",
          }));
      }

      return def.options
        .filter((opt) => opt.value.toLowerCase().startsWith(valPrefix))
        .map((opt) => ({
          prefix: `/set ${def.id} ${opt.value}`,
          label: `/set ${def.id} ${opt.value}`,
          desc: opt.description ?? opt.label,
        }));
    },
    execute: ({ rawArgs }) => {
      const [key, ...valParts] = rawArgs.split(/\s+/);
      if (!key) return;
      let val = valParts.join(" ").trim();
      if (val === "on") val = "true";
      if (val === "off") val = "false";
      settings.set(key, val);
    },
  },
];

/**
 * Executes a registered command by primary name or alias.
 */
export function executeCommand(name: string, ctx: CommandContext): boolean {
  const clean = name.toLowerCase().trim();
  const cmd = COMMAND_REGISTRY.find(
    (c) => c.name === clean || c.aliases?.some((a) => a.toLowerCase() === clean)
  );

  if (!cmd) return false;
  cmd.execute(ctx);
  return true;
}

/**
 * Autocomplete suggestions for CommandBar.svelte.
 */
export function getCommandSuggestions(input: string): CommandSuggestion[] {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/") && !trimmed.startsWith(":")) return [];

  // 1. Metadata filter autocomplete (:...)
  if (trimmed.startsWith(":")) {
    const filters: CommandSuggestion[] = [
      { prefix: ":artist", label: ":artist <name>", desc: "Filter by artist" },
      { prefix: ":album", label: ":album <name>", desc: "Filter by album" },
      { prefix: ":tag", label: ":tag <name>", desc: "Filter by tag" },
      { prefix: ":mood", label: ":mood <name>", desc: "Filter by mood" },
      {
        prefix: ":emotion",
        label: ":emotion <name>",
        desc: "Filter by acoustic emotion",
      },
      {
        prefix: ":d",
        label: ":d > 3m",
        desc: "Filter by duration (>, <, >=, <=)",
      },
      {
        prefix: ":lyrics",
        label: ':lyrics "phrase" or word',
        desc: "Full-text lyrics search",
      },
      {
        prefix: ":q",
        label: ":q <filter>",
        desc: "Filter within active queue",
      },
    ];
    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
    return filters.filter((f) => f.prefix.startsWith(firstWord));
  }

  // 2. Slash commands (/...)
  const firstSpace = trimmed.indexOf(" ");
  const enteredCmd = (
    firstSpace === -1 ? trimmed.slice(1) : trimmed.slice(1, firstSpace)
  ).toLowerCase();
  const rawArgs = firstSpace === -1 ? "" : trimmed.slice(firstSpace + 1);

  // If a command name is already entered followed by a space, delegate to that command's getSuggestions
  if (firstSpace !== -1) {
    const matched = COMMAND_REGISTRY.find(
      (c) =>
        c.name === enteredCmd ||
        c.aliases?.some((a) => a.toLowerCase() === enteredCmd)
    );
    if (matched?.getSuggestions) {
      return matched.getSuggestions(rawArgs);
    }
    return [];
  }

  // Otherwise, match against command catalog when still typing the command name
  return COMMAND_REGISTRY.filter(
    (c) =>
      c.name.startsWith(enteredCmd) ||
      c.aliases?.some((a) => a.startsWith(enteredCmd)) ||
      c.label.toLowerCase().includes(enteredCmd)
  ).map((c) => ({
    prefix: `/${c.name}`,
    label: c.label,
    desc: c.desc,
    shortcut: c.shortcut,
  }));
}
