<script lang="ts">
  import { tick } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { List, CirclePlus, MapPin, Tag, Check, X } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  export type LibraryViewMode = "list" | "map";

  interface Props {
    viewMode?: LibraryViewMode;
    disabled?: boolean;
    class?: string;
    onViewChange?: (mode: LibraryViewMode) => void;
    onTagAll?: (tag: string) => void;
    onEnqueueAll?: () => void;
  }

  let {
    viewMode = "list",
    disabled = false,
    class: className = "",
    onViewChange,
    onTagAll,
    onEnqueueAll,
  }: Props = $props();

  let isOpen = $state(false);
  let tagInput = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);

  async function toggleOpen() {
    if (disabled) return;
    isOpen = !isOpen;
    if (isOpen) {
      tagInput = "";
      await tick();
      inputEl?.focus();
    }
  }

  function handleSubmit() {
    const clean = tagInput.trim().toLowerCase();
    if (clean) {
      onTagAll?.(clean);
    }
    isOpen = false;
    tagInput = "";
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      isOpen = false;
      tagInput = "";
    }
  }
</script>

<div class={cn("relative flex items-center gap-2 select-none", className)}>
  <!-- Tag All Matches -->
  <Button
    variant="ghost"
    size="icon"
    {disabled}
    aria-label="Add tag to all filtered tracks"
    title="Tag all filtered tracks"
    onclick={toggleOpen}
    class={cn(
      "size-9 transition-colors",
      isOpen
        ? "bg-accent text-accent-foreground"
        : "text-muted-foreground hover:text-foreground"
    )}
  >
    <Tag class="size-5" />
  </Button>

  <!-- Enqueue All Matches -->
  <Button
    variant="ghost"
    size="icon"
    {disabled}
    aria-label="Enqueue all filtered tracks"
    title="Enqueue all"
    onclick={onEnqueueAll}
    class="size-9 text-muted-foreground hover:text-foreground"
  >
    <CirclePlus class="size-5" />
  </Button>

  <!-- View Mode Switcher -->
  <div class="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
    <button
      type="button"
      onclick={() => onViewChange?.("list")}
      aria-label="Switch to List View"
      title="List View"
      class={cn(
        "flex items-center justify-center p-1.5 rounded-md transition-colors",
        viewMode === "list"
          ? "bg-background font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <List class="size-5" />
    </button>
    <button
      type="button"
      onclick={() => onViewChange?.("map")}
      aria-label="Switch to Map View"
      title="Map View"
      class={cn(
        "flex items-center justify-center p-1.5 rounded-md transition-colors",
        viewMode === "map"
          ? "bg-background font-medium text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <MapPin class="size-5" />
    </button>
  </div>

  <!-- Anchored Inline Popover (below and aligned to the right) -->
  {#if isOpen}
    <div
      class="absolute right-0 top-full mt-2 z-50 flex items-center gap-1.5 p-1.5 rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
    >
      <input
        bind:this={inputEl}
        type="text"
        bind:value={tagInput}
        onkeydown={handleKeyDown}
        placeholder="tag name..."
        class="h-7 w-36 px-2 text-xs rounded border border-border bg-background text-foreground focus:outline-hidden focus:ring-1 focus:ring-primary lowercase"
      />
      <Button
        variant="ghost"
        size="icon"
        onclick={handleSubmit}
        class="size-7 text-muted-foreground hover:text-primary hover:bg-primary/10"
        title="Apply Tag"
      >
        <Check class="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onclick={() => {
          isOpen = false;
          tagInput = "";
        }}
        class="size-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        title="Cancel"
      >
        <X class="size-3.5" />
      </Button>
    </div>
  {/if}
</div>
