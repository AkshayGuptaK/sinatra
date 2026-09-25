<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import { Plus, X } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import InlineEditableCell from "$lib/components/atoms/InlineEditableCell.svelte";
  import TextInput from "$lib/components/atoms/TextInput.svelte";
  import EditableTagList from "./EditableTagList.svelte";

  interface Props {
    tags?: string[];
    maxVisible?: number;
    class?: string;
    onChange?: (tags: string[]) => void;
  }

  let {
    tags = [],
    maxVisible,
    class: className = "",
    onChange,
  }: Props = $props();

  let isAdding = $state(false);
  let newTagValue = $state("");
  let isPopoverOpen = $state(false);

  const visibleTags = $derived(
    maxVisible != null ? tags.slice(0, maxVisible) : tags
  );
  const hiddenCount = $derived(
    maxVisible != null ? Math.max(0, tags.length - maxVisible) : 0
  );

  function handleEditTag(index: number, nextVal: string) {
    const cleanVal = nextVal.trim().toLowerCase();
    const nextTags = [...tags];

    if (!cleanVal) {
      nextTags.splice(index, 1);
    } else {
      nextTags[index] = cleanVal;
    }

    onChange?.(nextTags);
  }

  function handleRemoveTag(index: number, e: MouseEvent) {
    e.stopPropagation();
    const nextTags = tags.filter((_, i) => i !== index);
    onChange?.(nextTags);
  }

  function handleAddSubmit() {
    const cleanVal = newTagValue.trim().toLowerCase();
    if (cleanVal && !tags.includes(cleanVal)) {
      onChange?.([...tags, cleanVal]);
    }
    newTagValue = "";
    isAdding = false;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddSubmit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      newTagValue = "";
      isAdding = false;
    }
  }

  function togglePopover(e: MouseEvent) {
    e.stopPropagation();
    isPopoverOpen = !isPopoverOpen;
  }
</script>

<div
  class={cn(
    "relative flex items-center gap-1.5 flex-nowrap min-w-0 select-none",
    className
  )}
>
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

  {#if hiddenCount > 0}
    <button
      type="button"
      onclick={togglePopover}
      class="shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted/80 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50 transition-colors cursor-pointer"
      title="View all tags"
    >
      +{hiddenCount}
    </button>
  {/if}

  {#if hiddenCount === 0}
    {#if isAdding}
      <div class="shrink-0">
        <TextInput
          autofocus
          bind:value={newTagValue}
          variant="inline"
          onblur={handleAddSubmit}
          onkeydown={handleKeyDown}
          placeholder="new tag"
          class="h-5 w-20 px-2 py-0 text-xs rounded-full border border-primary/50 focus:outline-hidden focus:ring-1 focus:ring-primary/40 lowercase"
        />
      </div>
    {:else}
      <Button
        variant="ghost"
        size="icon"
        onclick={(e) => {
          e.stopPropagation();
          isAdding = true;
        }}
        class="size-5 rounded-full border border-dashed border-border/70 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground/60 hover:text-foreground hover:border-foreground/40 hover:bg-transparent transition-all cursor-pointer shrink-0"
        title="Add tag"
      >
        <Plus class="size-3 shrink-0" />
      </Button>
    {/if}
  {/if}

  <!-- Popover Panel for Full Tag List -->
  {#if isPopoverOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      onclick={(e) => e.stopPropagation()}
      class="absolute right-0 top-full mt-1.5 z-50 w-64 p-3 rounded-lg border border-border/80 bg-popover/95 text-popover-foreground shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
    >
      <div
        class="flex items-center justify-between pb-2 mb-2 border-b border-border/60"
      >
        <span class="text-xs font-semibold text-foreground"
          >All Tags ({tags.length})</span
        >
        <Button
          variant="ghost"
          size="icon"
          onclick={() => (isPopoverOpen = false)}
          class="size-5 p-0 text-muted-foreground hover:text-foreground hover:bg-transparent cursor-pointer"
          title="Close"
        >
          <X class="size-3.5" />
        </Button>
      </div>

      <EditableTagList {tags} {onChange} class="flex-wrap" />
    </div>
  {/if}
</div>
