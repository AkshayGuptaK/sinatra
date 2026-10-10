<!-- src/lib/components/molecules/CommandBar.svelte -->
<script lang="ts">
  import { Search, Sparkles, Funnel, X, CornerDownLeft } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import TextInput from "$lib/components/atoms/TextInput.svelte";
  import {
    parseCommandInput,
    type ParsedIntent,
  } from "$lib/utils/commandParser";
  import { cn } from "$lib/utils";
  import { getSettingSuggestions } from "$lib/utils/settingsSuggestions";

  interface Props {
    class?: string;
    onSearchChange?: (intent: ParsedIntent) => void;
    onCommandSubmit?: (intent: ParsedIntent) => void;
  }

  let {
    class: className = "",
    onSearchChange,
    onCommandSubmit,
  }: Props = $props();

  let rawInput = $state("");
  let isFocused = $state(false);
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  const COMMAND_SUGGESTIONS = [
    {
      prefix: "/p",
      label: "/play <prompt>",
      desc: "Replace queue with prompted music",
    },
    {
      prefix: "/q",
      label: "/queue <prompt>",
      desc: "Add prompted music to queue",
    },
    {
      prefix: "/dj",
      label: "/dj <filter>",
      desc: "Set AutoDJ hard boundary (:tag, :mood, :d)",
    },
    {
      prefix: ":artist",
      label: ":artist <name>",
      desc: "Filter library strictly by artist",
    },
    {
      prefix: ":album",
      label: ":album <name>",
      desc: "Filter library strictly by album",
    },
    {
      prefix: ":mood",
      label: ":mood <name>",
      desc: "Filter library strictly by mood",
    },
    {
      prefix: ":tag",
      label: ":tag <name>",
      desc: "Filter library strictly by tag",
    },
    {
      prefix: ":d",
      label: ":duration > 3m",
      desc: "Filter by duration (>, <, >=, <=)",
    },
    {
      prefix: ":lyric",
      label: ':lyrics "phrase" or word',
      desc: "Filter library strictly by lyrics",
    },
    {
      prefix: ":q",
      label: ":queued <filter>",
      desc: "Filter within currently queued tracks",
    },
  ];

  // Only suggest when typing a command or filter prefix and before parameters are fully entered
  let matchingSuggestions = $derived.by(() => {
    const trimmed = rawInput.trimStart();
    if (trimmed.startsWith("/set")) {
      return getSettingSuggestions(trimmed);
    }
    if (!trimmed.startsWith("/") && !trimmed.startsWith(":")) {
      return [];
    }

    const firstWord = trimmed.split(/\s+/)[0].toLowerCase();
    return COMMAND_SUGGESTIONS.filter((s) =>
      s.prefix.toLowerCase().startsWith(firstWord)
    );
  });

  // Keep selection bounded when matching suggestions change
  $effect(() => {
    if (selectedIndex >= matchingSuggestions.length) {
      selectedIndex = 0;
    }
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    rawInput = target.value;
    onSearchChange?.(parseCommandInput(rawInput));
  }

  function applySuggestion(prefix: string) {
    rawInput = prefix + " ";
    selectedIndex = 0;
    onSearchChange?.(parseCommandInput(rawInput));
    inputEl?.focus();
  }

  function handleKeydown(e: KeyboardEvent) {
    // 1. Suggestion List Navigation
    if (matchingSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % matchingSuggestions.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        selectedIndex =
          (selectedIndex - 1 + matchingSuggestions.length) %
          matchingSuggestions.length;
        return;
      }
      // Tab autocompletes the highlighted prefix
      if (e.key === "Tab") {
        e.preventDefault();
        applySuggestion(matchingSuggestions[selectedIndex].prefix);
        return;
      }
    }

    // 2. Intent Submission
    if (e.key === "Enter") {
      e.preventDefault();
      // If the user typed an exact prefix and hit Enter with suggestions open, autocomplete it
      if (
        matchingSuggestions.length > 0 &&
        rawInput.trim() === matchingSuggestions[selectedIndex]?.prefix
      ) {
        applySuggestion(matchingSuggestions[selectedIndex].prefix);
        return;
      }

      const parsed = parseCommandInput(rawInput);
      onCommandSubmit?.(parsed);
      rawInput = "";
      inputEl?.blur();
      return;
    }

    // 3. Clear on Escape
    if (e.key === "Escape") {
      e.preventDefault();
      rawInput = "";
      onSearchChange?.({ type: "text_search", query: "" });
      inputEl?.blur();
    }
  }

  function clearInput() {
    rawInput = "";
    onSearchChange?.({ type: "text_search", query: "" });
    inputEl?.focus();
  }
</script>

<div class={cn("relative w-full max-w-xl select-none", className)}>
  <div class="relative flex items-center">
    <!-- Dynamic Prefix Icon Indicator -->
    <div
      class="absolute left-3 z-10 flex items-center pointer-events-none text-muted-foreground"
    >
      {#if rawInput.startsWith("/")}
        <Sparkles class="size-4 shrink-0 text-primary animate-pulse" />
      {:else if rawInput.startsWith(":")}
        <Funnel class="size-4 shrink-0 text-primary" />
      {:else}
        <Search class="size-4 shrink-0" />
      {/if}
    </div>

    <!-- Main Omnibar Input -->
    <TextInput
      bind:ref={inputEl}
      value={rawInput}
      placeholder="Search songs, :artist, :d > 3m, or /p upbeat jazz... (Esc to clear)"
      oninput={handleInput}
      onkeydown={handleKeydown}
      onfocus={() => (isFocused = true)}
      onblur={() => setTimeout(() => (isFocused = false), 150)}
      class="pl-9 pr-9 h-10 w-full bg-background/80 backdrop-blur border-muted-foreground/30 focus-visible:ring-1 text-sm font-normal"
    />

    <!-- Clear Action Button -->
    {#if rawInput.length > 0}
      <Button
        variant="ghost"
        size="icon"
        onclick={clearInput}
        class="absolute right-1 size-7 text-muted-foreground hover:text-foreground"
      >
        <X class="size-3.5" />
      </Button>
    {/if}
  </div>

  <!-- Autocomplete Suggestions Dropdown -->
  {#if isFocused && matchingSuggestions.length > 0}
    <div
      class="absolute top-full left-0 right-0 mt-1.5 p-1 bg-popover/95 text-popover-foreground border border-border/80 rounded-lg shadow-2xl backdrop-blur-md z-50 overflow-hidden text-xs animate-in fade-in zoom-in-95 duration-75"
    >
      <div
        class="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
      >
        Commands & Filters
      </div>

      {#each matchingSuggestions as sug, idx}
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <div
          role="button"
          tabindex={-1}
          onclick={() => applySuggestion(sug.prefix)}
          class={cn(
            "flex items-center justify-between px-2.5 py-1.5 rounded-md cursor-pointer transition-colors",
            idx === selectedIndex
              ? "bg-accent text-accent-foreground font-medium"
              : "hover:bg-muted/50 text-foreground"
          )}
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="font-mono text-primary font-medium">{sug.label}</span>
            <span class="text-muted-foreground text-[11px] truncate"
              >{sug.desc}</span
            >
          </div>

          {#if idx === selectedIndex}
            <kbd
              class="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-background border border-border rounded shadow-2xs shrink-0"
            >
              <span>tab</span>
              <CornerDownLeft class="size-2.5" />
            </kbd>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
