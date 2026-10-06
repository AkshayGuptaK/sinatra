<script lang="ts">
  import InlineEditableCell from "$lib/components/atoms/InlineEditableCell.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Plus, X } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  interface Props {
    tags?: string[];
    maxVisible?: number;
    class?: string;
    isEditorOpen?: boolean;
    onChange?: (tags: string[]) => void;
    onOpenTagEditor?: (triggerEl: HTMLElement) => void;
  }

  let {
    tags = [],
    maxVisible = 2,
    class: className = "",
    isEditorOpen = false,
    onChange,
    onOpenTagEditor,
  }: Props = $props();

  let triggerBtnEl = $state<HTMLElement | null>(null);

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

  function handleOpenClick(e: MouseEvent) {
    e.stopPropagation();
    if (triggerBtnEl) {
      onOpenTagEditor?.(triggerBtnEl);
    }
  }
</script>

<div
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

  <!-- Overflow Count: Clean static pill -->
  {#if hiddenCount > 0}
    <span
      class="shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted/80 text-muted-foreground border border-border/50 select-none"
    >
      +{hiddenCount}
    </span>
  {/if}

  <!-- Single Action Trigger: Shows on cell hover or stays active when editor is open -->
  <Button
    bind:ref={triggerBtnEl}
    variant="ghost"
    size="icon"
    onclick={handleOpenClick}
    class={cn(
      "size-5 rounded-full border border-dashed border-border/70 p-0 text-muted-foreground/60 hover:text-foreground hover:border-foreground/40 hover:bg-transparent transition-all cursor-pointer shrink-0",
      isEditorOpen
        ? "opacity-100 border-primary text-primary"
        : "opacity-0 group-hover/tagcell:opacity-100"
    )}
    title="Add or suggest tags"
  >
    <Plus class="size-3 shrink-0" />
  </Button>
</div>