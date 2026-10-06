<script lang="ts">
  import { tick } from "svelte";
  import * as Popover from "$lib/components/ui/popover";
  import { Button } from "$lib/components/ui/button";
  import TextInput from "$lib/components/atoms/TextInput.svelte";
  import { Plus, X, Sparkles } from "@lucide/svelte";
  import type { TagRecommendation } from "$lib/audio/library.svelte";

  interface Props {
    open: boolean;
    tags: string[];
    trackTitle?: string;
    onOpenChange: (open: boolean) => void;
    onChange: (tags: string[]) => void;
    suggestTags: () => Promise<TagRecommendation[]>;
  }

  let {
    open = $bindable(false),
    tags = [],
    trackTitle = "",
    onOpenChange,
    onChange,
    suggestTags,
  }: Props = $props();

  let newTagValue = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);
  let suggestions = $state<TagRecommendation[]>([]);
  let isLoadingSuggestions = $state(false);

  // Trigger suggestion loading when opened
  $effect(() => {
    if (open) {
      newTagValue = "";
      loadSuggestions();
    } else {
      suggestions = [];
      newTagValue = "";
    }
  });

  async function loadSuggestions() {
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

  function updateTags(nextTags: string[]) {
    const clean = Array.from(
      new Set(nextTags.map((t) => t.trim().toLowerCase()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    onChange(clean);
  }

  function handleRemoveTag(index: number, e: MouseEvent) {
    e.stopPropagation();
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

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSubmit();
    }
  }
</script>

<Popover.Content
  side="bottom"
  align="end"
  sideOffset={6}
  class="w-72 p-3 rounded-lg border border-border/90 bg-popover text-popover-foreground shadow-2xl backdrop-blur-md flex flex-col gap-2.5 z-50 select-none"
>
  <!-- Header -->
  <div
    class="flex items-center justify-between pb-1.5 border-b border-border/50"
  >
    <div class="flex flex-col min-w-0 pr-2">
      <span class="text-xs font-semibold text-foreground truncate">
        Tags ({tags.length})
      </span>
      {#if trackTitle}
        <span class="text-[10px] text-muted-foreground truncate"
          >{trackTitle}</span
        >
      {/if}
    </div>
    <Button
      variant="ghost"
      size="icon"
      onclick={() => onOpenChange(false)}
      class="size-5 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent cursor-pointer"
      title="Close"
    >
      <X class="size-3.5" />
    </Button>
  </div>

  <!-- Manual Tag Entry -->
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

  <!-- Existing Tags Cluster -->
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

  <!-- AI Suggestions Tray -->
  <div class="pt-2 border-t border-border/50 flex flex gap-1.5">
    <div
      class="flex items-center gap-1 text-[11px] font-medium text-muted-foreground"
    >
      <Sparkles class="size-3 text-primary" />
    </div>

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
</Popover.Content>
