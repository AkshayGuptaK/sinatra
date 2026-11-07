<!-- src/lib/components/molecules/CommandBar.svelte -->
<script lang="ts">
  import { Search, Sparkles, Funnel, X, CornerDownLeft } from "@lucide/svelte";
  import { Button } from "$lib/components/ui/button";
  import TextInput from "$lib/components/atoms/TextInput.svelte";
  import { parseCommandInput } from "$lib/utils/commandParser";
  import { cn } from "$lib/utils";
  import {
    getCommandSuggestions,
    type CommandSuggestion,
  } from "$lib/config/commandRegistry";
  import {
    handleCommandSubmit,
    handleFilterChange,
  } from "$lib/core/command.svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  let rawInput = $state("");
  let isFocused = $state(false);
  let selectedIndex = $state(0);
  let inputEl = $state<HTMLInputElement | null>(null);

  let matchingSuggestions = $derived(getCommandSuggestions(rawInput));

  $effect(() => {
    if (selectedIndex >= matchingSuggestions.length) {
      selectedIndex = 0;
    }
  });

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    rawInput = target.value;
    handleFilterChange(parseCommandInput(rawInput));
  }

  function applySuggestion(prefix: string) {
    rawInput = prefix + " ";
    selectedIndex = 0;
    handleFilterChange(parseCommandInput(rawInput));
    inputEl?.focus();
  }

  /**
   * Identifies whether a suggestion can be executed immediately as a terminal command,
   * or if it requires additional user parameters (e.g. a search query or setting value).
   */
  function isTerminalSuggestion(sug: CommandSuggestion): boolean {
    // If the label contains an argument placeholder like <name>, it needs parameters
    if (sug.label.includes("<")) return false;

    // Filter prefixes starting with ':' require a query argument
    if (sug.prefix.startsWith(":")) return false;

    // An incomplete /set without a value needs its value
    const parts = sug.prefix.trim().split(/\s+/);
    if (parts[0] === "/set" && parts.length < 3) return false;

    return true;
  }

  function handleSelectSuggestion(sug: CommandSuggestion) {
    if (isTerminalSuggestion(sug)) {
      const parsed = parseCommandInput(sug.prefix);
      handleCommandSubmit(parsed);
      rawInput = "";
      inputEl?.blur();
    } else {
      applySuggestion(sug.prefix);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
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
      if (e.key === "Tab") {
        e.preventDefault();
        const selectedSug = matchingSuggestions[selectedIndex];
        if (selectedSug) {
          applySuggestion(selectedSug.prefix);
        }
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();

      const selectedSug = matchingSuggestions[selectedIndex];

      // If the suggestion menu is open and an item is selected
      if (selectedSug) {
        if (!isTerminalSuggestion(selectedSug)) {
          // Intermediate prefix (e.g. "/s", ":artist", "/set appearance.theme") -> autocomplete it
          applySuggestion(selectedSug.prefix);
          return;
        }

        // Terminal suggestion (e.g. "/lyrics", "/next", "/set appearance.theme dark") -> execute
        const parsed = parseCommandInput(selectedSug.prefix);
        handleCommandSubmit(parsed);
        rawInput = "";
        inputEl?.blur();
        return;
      }

      // Otherwise, submit user's rawInput directly (e.g. freeform search, /s query, /p prompt)
      const parsed = parseCommandInput(rawInput);
      handleCommandSubmit(parsed);
      rawInput = "";
      inputEl?.blur();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      rawInput = "";
      handleFilterChange({ type: "text_search", query: "" });
      inputEl?.blur();
    }
  }

  function clearInput() {
    rawInput = "";
    handleFilterChange({ type: "text_search", query: "" });
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
          onclick={() => handleSelectSuggestion(sug)}
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

          <div class="flex items-center gap-2 shrink-0">
            {#if sug.shortcut && idx !== selectedIndex}
              <kbd
                class="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/80 bg-muted/60 border border-border/50 rounded"
              >
                {sug.shortcut}
              </kbd>
            {/if}

            {#if idx === selectedIndex}
              <kbd
                class="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground bg-background border border-border rounded shadow-2xs shrink-0"
              >
                <span>{isTerminalSuggestion(sug) ? "enter" : "tab"}</span>
                <CornerDownLeft class="size-2.5" />
              </kbd>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
