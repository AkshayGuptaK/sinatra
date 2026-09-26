<script lang="ts">
  import { tick } from "svelte";
  import TextInput from "$lib/components/atoms/TextInput.svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import { List, CirclePlus, MapPin, Tag, Check, X } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  export type LibraryViewMode = "list" | "map";

  interface Props {
    viewMode?: LibraryViewMode;
    disabled?: boolean;
    class?: string;
    onViewChange?: (mode: LibraryViewMode) => void;
    onTagAll?: (tag: string) => void;
    onEnqueueAll: () => void;
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
  <ControlButton
    icon={Tag}
    label="Add tag to all filtered tracks"
    title="Tag all filtered tracks"
    onClick={toggleOpen}
    {disabled}
    class={isOpen
      ? "bg-accent text-primary"
      : "text-muted-foreground hover:text-secondary-foreground"}
  ></ControlButton>

  <ControlButton
    icon={CirclePlus}
    label="Enqueue all filtered tracks"
    title="Enqueue all"
    onClick={onEnqueueAll}
    {disabled}
  ></ControlButton>

  <!-- View Mode Switcher -->
  <div class="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
    <ControlButton
      icon={List}
      onClick={() => onViewChange?.("list")}
      label="Switch to List View"
      title="List View"
      class={cn(
        "size-7 p-1 rounded-md",
        viewMode === "list"
          ? "bg-background font-medium text-primary shadow-sm hover:text-primary"
          : "text-muted-foreground hover:text-secondary-foreground hover:bg-transparent"
      )}
    ></ControlButton>
    <ControlButton
      icon={MapPin}
      onClick={() => onViewChange?.("map")}
      label="Switch to Map View"
      title="Map View"
      class={cn(
        "size-7 p-1 rounded-md",
        viewMode === "map"
          ? "bg-background font-medium text-primary shadow-sm hover:text-primary"
          : "text-muted-foreground hover:text-secondary-foreground hover:bg-transparent"
      )}
    ></ControlButton>
  </div>

  <!-- Anchored Inline Popover (below and aligned to the right) -->
  {#if isOpen}
    <div
      class="absolute right-0 top-full mt-2 z-50 flex items-center gap-1.5 p-1.5 rounded-lg border border-border/80 bg-popover text-popover-foreground shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
    >
      <TextInput
        bind:ref={inputEl}
        bind:value={tagInput}
        onkeydown={handleKeyDown}
        placeholder="tag name..."
        class="h-7 w-36 px-2 text-xs rounded focus:outline-hidden focus-visible:ring-0 focus:ring-primary lowercase"
      />
      <ControlButton
        icon={Check}
        onClick={handleSubmit}
        title="Apply Tag"
        class="size-7"
        iconClass="size-3.5"
      ></ControlButton>
      <ControlButton
        icon={X}
        onClick={() => {
          isOpen = false;
          tagInput = "";
        }}
        title="Cancel"
        class="size-7 hover:text-destructive hover:bg-destructive/10"
        iconClass="size-3.5"
      ></ControlButton>
    </div>
  {/if}
</div>
