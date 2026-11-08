<script module lang="ts">
  // Shared state across all mounted CommandBar instances
  let sharedRawInput = $state("");
  let sharedSelectedIndex = $state(0);
  let sharedSelectionStart = $state<number | null>(null);
  let sharedSelectionEnd = $state<number | null>(null);
  let isAnyBarFocused = $state(false);
</script>

<script lang="ts">
  import { tick, untrack } from "svelte";
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
  import { ui, type AppDeck } from "$lib/stores/ui.svelte";

  interface Props {
    deck?: AppDeck | string;
    class?: string;
  }

  let { deck, class: className = "" }: Props = $props();

  let isFocused = $state(false);
  let inputEl = $state<HTMLInputElement | null>(null);

  let matchingSuggestions = $derived(getCommandSuggestions(sharedRawInput));

  // Keep selection index bounded when suggestions list updates
  $effect(() => {
    if (sharedSelectedIndex >= matchingSuggestions.length) {
      sharedSelectedIndex = 0;
    }
  });

  // Track deck switches to seamlessly transfer focus and caret position
  let previousDeck = ui.activeDeck;
  $effect(() => {
    const currentDeck = ui.activeDeck;
    const deckChanged = currentDeck !== previousDeck;
    previousDeck = currentDeck;

    // When switching to this instance's deck, claim focus only if the user was actively typing
    if (deckChanged && deck && currentDeck === deck) {
      const shouldHandoff = untrack(() => isAnyBarFocused);
      if (shouldHandoff && inputEl) {
        tick().then(() => {
          const start = sharedSelectionStart;
          const end = sharedSelectionEnd;
          inputEl?.focus(); // this resets the shared selection state
          if (start !== null && end !== null) {
            inputEl?.setSelectionRange(start, end);
            sharedSelectionStart = start;
            sharedSelectionEnd = end;
          }
        });
      }
    }
  });

  function syncCaret() {
    if (!inputEl) return;
    sharedSelectionStart = inputEl.selectionStart;
    sharedSelectionEnd = inputEl.selectionEnd;
  }

  function handleFocus() {
    isFocused = true;
    isAnyBarFocused = true;
    syncCaret();
  }

  function handleBlur() {
    // 150ms delay allows clicking suggestions or switching decks before teardown
    setTimeout(() => {
      isFocused = false;
      if (!document.activeElement?.closest("[data-command-bar-root]")) {
        isAnyBarFocused = false;
      }
    }, 150);
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    sharedRawInput = target.value;
    sharedSelectedIndex = 0;
    syncCaret();
    handleFilterChange(parseCommandInput(sharedRawInput));
  }

  function applySuggestion(prefix: string) {
    sharedRawInput = prefix + " ";
    sharedSelectedIndex = 0;
    sharedSelectionStart = sharedRawInput.length;
    sharedSelectionEnd = sharedRawInput.length;
    handleFilterChange(parseCommandInput(sharedRawInput));

    tick().then(() => {
      inputEl?.focus();
      inputEl?.setSelectionRange(sharedRawInput.length, sharedRawInput.length);
    });
  }

  /**
   * Identifies whether a suggestion can be executed immediately as a terminal command,
   * or if it requires additional user parameters (e.g. a search query or setting value).
   */
  function isTerminalSuggestion(sug: CommandSuggestion): boolean {
    if (sug.label.includes("<")) return false;
    if (sug.prefix.startsWith(":")) return false;

    const parts = sug.prefix.trim().split(/\s+/);
    if (parts[0] === "/set" && parts.length < 3) return false;

    return true;
  }

  function handleSelectSuggestion(sug: CommandSuggestion) {
    if (isTerminalSuggestion(sug)) {
      const parsed = parseCommandInput(sug.prefix);
      handleCommandSubmit(parsed);
      sharedRawInput = "";
      sharedSelectedIndex = 0;
      isAnyBarFocused = false;
      isFocused = false;
      inputEl?.blur();
    } else {
      applySuggestion(sug.prefix);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (matchingSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        sharedSelectedIndex =
          (sharedSelectedIndex + 1) % matchingSuggestions.length;
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        sharedSelectedIndex =
          (sharedSelectedIndex - 1 + matchingSuggestions.length) %
          matchingSuggestions.length;
        return;
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const selectedSug = matchingSuggestions[sharedSelectedIndex];
        if (selectedSug) {
          applySuggestion(selectedSug.prefix);
        }
        return;
      }
    }

    if (e.key === "Enter") {
      e.preventDefault();

      const selectedSug = matchingSuggestions[sharedSelectedIndex];

      if (selectedSug) {
        if (!isTerminalSuggestion(selectedSug)) {
          applySuggestion(selectedSug.prefix);
          return;
        }

        const parsed = parseCommandInput(selectedSug.prefix);
        handleCommandSubmit(parsed);
        sharedRawInput = "";
        sharedSelectedIndex = 0;
        isAnyBarFocused = false;
        isFocused = false;
        inputEl?.blur();
        return;
      }

      const parsed = parseCommandInput(sharedRawInput);
      handleCommandSubmit(parsed);
      sharedRawInput = "";
      sharedSelectedIndex = 0;
      isAnyBarFocused = false;
      isFocused = false;
      inputEl?.blur();
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      sharedRawInput = "";
      sharedSelectedIndex = 0;
      sharedSelectionStart = 0;
      sharedSelectionEnd = 0;
      handleFilterChange({ type: "text_search", query: "" });
      isAnyBarFocused = false;
      isFocused = false;
      inputEl?.blur();
    }
  }

  function clearInput() {
    sharedRawInput = "";
    sharedSelectedIndex = 0;
    sharedSelectionStart = 0;
    sharedSelectionEnd = 0;
    handleFilterChange({ type: "text_search", query: "" });
    tick().then(() => {
      inputEl?.focus();
    });
  }
</script>

<div
  data-command-bar-root
  class={cn("relative w-full max-w-xl select-none", className)}
>
  <div class="relative flex items-center">
    <!-- Dynamic Prefix Icon Indicator -->
    <div
      class="absolute left-3 z-10 flex items-center pointer-events-none text-muted-foreground"
    >
      {#if sharedRawInput.startsWith("/")}
        <Sparkles class="size-4 shrink-0 text-primary animate-pulse" />
      {:else if sharedRawInput.startsWith(":")}
        <Funnel class="size-4 shrink-0 text-primary" />
      {:else}
        <Search class="size-4 shrink-0" />
      {/if}
    </div>

    <!-- Main Omnibar Input -->
    <TextInput
      bind:ref={inputEl}
      data-command-bar-input
      value={sharedRawInput}
      placeholder="Search songs, :artist, :d > 3m, or /p upbeat jazz... (Esc to clear)"
      oninput={handleInput}
      onkeydown={handleKeydown}
      onkeyup={syncCaret}
      onclick={syncCaret}
      onselect={syncCaret}
      onfocus={handleFocus}
      onblur={handleBlur}
      class="pl-9 pr-9 h-10 w-full bg-background/80 backdrop-blur border-muted-foreground/30 focus-visible:ring-1 text-sm font-normal"
    />

    <!-- Clear Action Button -->
    {#if sharedRawInput.length > 0}
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
  {#if isFocused && matchingSuggestions.length > 0 && (!deck || ui.activeDeck === deck)}
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
            idx === sharedSelectedIndex
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
            {#if sug.shortcut && idx !== sharedSelectedIndex}
              <kbd
                class="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/80 bg-muted/60 border border-border/50 rounded"
              >
                {sug.shortcut}
              </kbd>
            {/if}

            {#if idx === sharedSelectedIndex}
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
