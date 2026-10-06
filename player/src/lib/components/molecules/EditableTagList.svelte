<script lang="ts">
  import { tick, onMount } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import { Plus, X, Sparkles } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import type { TagRecommendation } from "$lib/audio/library.svelte";
  import InlineEditableCell from "$lib/components/atoms/InlineEditableCell.svelte";
  import TextInput from "$lib/components/atoms/TextInput.svelte";
  import EditableTagList from "./EditableTagList.svelte";

  interface Props {
    tags?: string[];
    maxVisible: number;
    class?: string;
    onChange?: (tags: string[]) => void;
    suggestTags: () => Promise<TagRecommendation[]>;
  }

  let {
    tags = [],
    maxVisible,
    class: className = "",
    onChange,
    suggestTags,
  }: Props = $props();

  let isPopoverOpen = $state(false);
  let newTagValue = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);
  let rootEl = $state<HTMLDivElement | null>(null);
  let popoverEl = $state<HTMLDivElement | null>(null);

  // Suggestions state
  let suggestions = $state<TagRecommendation[]>([]);
  let isLoadingSuggestions = $state(false);

  // Layout derivations
  const visibleTags = $derived(tags.slice(0, maxVisible));
  const hiddenCount = $derived(Math.max(0, tags.length - maxVisible));

  function updateTags(nextTags: string[]) {
    const clean = Array.from(
      new Set(nextTags.map((t) => t.trim().toLowerCase()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    onChange?.(clean);
  }

  function handleEditTag(index: number, nextVal: string) {
    const nextTags = [...tags];
    const cleanVal = nextVal.trim().toLowerCase();
    if (!cleanVal) {
      nextTags.splice(index, 1);
    } else {
      nextTags[index] = cleanVal;
    }
    updateTags(nextTags);
  }

  function handleRemoveTag(index: number, e?: MouseEvent) {
    e?.stopPropagation();
    const nextTags = tags.filter((_, i) => i !== index);
    updateTags(nextTags);
  }

  function handleAddSubmit() {
    const cleanVal = newTagValue.trim().toLowerCase();
    if (cleanVal && !tags.includes(cleanVal)) {
      updateTags([...tags, cleanVal]);
      suggestions = suggestions.filter((s) => s.tag !== cleanVal);
    }
    newTagValue = "";
  }

  function handleAcceptSuggestion(suggestion: TagRecommendation) {
    updateTags([...tags, suggestion.tag]);
    suggestions = suggestions.filter((s) => s.tag !== suggestion.tag);
  }

  async function openPopover(e: MouseEvent) {
    e.stopPropagation();
    isPopoverOpen = true;
    newTagValue = "";

    isLoadingSuggestions = true;
    try {
      suggestions = await suggestTags();
    } catch (err) {
      console.error("Failed to load tag suggestions:", err);
    } finally {
      isLoadingSuggestions = false;
    }

    await tick();
    inputEl?.focus();
  }

  function closePopover(e?: MouseEvent) {
    e?.stopPropagation();
    isPopoverOpen = false;
    newTagValue = "";
    suggestions = [];
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePopover();
    }
  }

  $effect(() => {
    if (!isPopoverOpen) return;

    function handleDocumentClick(event: PointerEvent) {
      const target = event.target as Node | null;
      if (popoverEl && target && !popoverEl.contains(target)) {
        closePopover();
      }
    }

    window.addEventListener("pointerdown", handleDocumentClick);

    return () => {
      window.removeEventListener("pointerdown", handleDocumentClick);
    };
  });
</script>

<div
  bind:this={rootEl}
  class={cn(
    "relative flex items-center gap-1.5 flex-nowrap min-w-0 select-none",
    className
  )}
>
  <!-- Inline Visible Pills -->
  {#each visibleTags as tag, index (tag)}
    <div
      class="group/pill shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted border border-border/60 text-muted-foreground hover:border-border transition-colors"
    >
      <InlineEditableCell
        value={tag}
        placeholder="tag"
        class="text-xs text-muted-foreground lowercase cursor-pointer"
        inputClass="w-20"
        onSave={(val) => handleEditTag(index, val)}
      />
      <Button
        variant="ghost"
        size="icon"
        tabindex={-1}
        onclick={(e) => handleRemoveTag(index, e)}
        class="size-3.5 p-0 -mr-0.5 opacity-0 group-hover/pill:opacity-100 text-muted-foreground hover:text-destructive hover:bg-transparent transition-opacity cursor-pointer"
        title="Remove tag"
      >
        <X class="size-3 shrink-0" />
      </Button>
    </div>
  {/each}

  <!-- Overflow Count Button -->
  {#if hiddenCount > 0}
    <button
      type="button"
      onclick={openPopover}
      class="shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50 transition-colors cursor-pointer"
      title="View all and suggest tags"
    >
      +{hiddenCount}
    </button>
  {/if}

  <!-- Scoped '+' Trigger: Only reveals on hover of the tag cell -->
  <Button
    variant="ghost"
    size="icon"
    onclick={openPopover}
    class="size-5 rounded-full border border-dashed border-border/70 p-0 opacity-0 group-hover/tagcell:opacity-100 text-muted-foreground/60 hover:text-foreground hover:border-foreground/40 hover:bg-transparent transition-all cursor-pointer shrink-0"
    title="Add or suggest tags"
  >
    <Plus class="size-3 shrink-0" />
  </Button>

  <!-- Unified Add / Edit / Auto-Suggest Popover -->
  {#if isPopoverOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      bind:this={popoverEl}
      onclick={(e) => e.stopPropagation()}
      onpointerdown={(e) => e.stopPropagation()}
      class="absolute left-0 top-1/2 -translate-y-1/4 z-50 w-72 p-3 rounded-lg border border-border/90 bg-popover text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-2.5 ring-1 ring-black/5"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between pb-1.5 border-b border-border/50"
      >
        <span
          class="text-xs font-semibold text-foreground flex items-center gap-1.5"
        >
          Tags ({tags.length})
        </span>
        <Button
          variant="ghost"
          size="icon"
          onclick={closePopover}
          class="size-5 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent cursor-pointer"
          title="Close"
        >
          <X class="size-3.5" />
        </Button>
      </div>

      <!-- Section 1: Manual Tag Input -->
      <div class="flex items-center gap-1.5">
        <TextInput
          bind:ref={inputEl}
          bind:value={newTagValue}
          onkeydown={handleKeyDown}
          placeholder="Add custom tag..."
          class="h-7 text-xs px-2 rounded border border-border bg-background focus-visible:ring-1 focus-visible:ring-primary lowercase"
        />
        <Button
          variant="secondary"
          size="sm"
          onclick={handleAddSubmit}
          disabled={!newTagValue.trim()}
          class="h-7 px-2.5 text-xs shrink-0 cursor-pointer"
        >
          Add
        </Button>
      </div>

      <!-- Section 2: Current Tags Cluster -->
      {#if tags.length > 0}
        <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto py-0.5">
          {#each tags as tag, index (tag)}
            <span
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-muted border border-border/60 text-muted-foreground"
            >
              <span class="lowercase">{tag}</span>
              <button
                type="button"
                onclick={(e) => handleRemoveTag(index, e)}
                class="hover:text-destructive cursor-pointer"
                title="Remove tag"
              >
                <X class="size-2.5" />
              </button>
            </span>
          {/each}
        </div>
      {/if}

      <!-- Section 3: AI Recommendations Tray -->
      <div class="pt-2 border-t border-border/50 flex gap-1.5">
        <span
          class="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
        >
          <Sparkles class="size-3 text-primary" />
        </span>

        {#if isLoadingSuggestions}
          <div class="text-[11px] text-muted-foreground/60 italic py-1">
            Analyzing audio profile...
          </div>
        {:else if suggestions.length === 0}
          <div class="text-[11px] text-muted-foreground/60 italic py-0.5">
            No new suggestions available.
          </div>
        {:else}
          <div class="flex flex-wrap gap-1 max-h-24 overflow-y-auto py-0.5">
            {#each suggestions as suggestion (suggestion.tag)}
              <button
                type="button"
                onclick={() => handleAcceptSuggestion(suggestion)}
                class="group/sug inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/15 text-primary hover:border-primary transition-colors cursor-pointer"
                title={`Confidence: ${Math.round(suggestion.confidence * 100)}%`}
              >
                <Plus
                  class="size-2.5 text-primary/70 group-hover/sug:text-primary shrink-0"
                />
                <span class="lowercase">{suggestion.tag}</span>
                <span class="text-[10px] opacity-60 tabular-nums">
                  {Math.round(suggestion.confidence * 100)}%
                </span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {/if}
</div>
