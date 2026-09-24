<script lang="ts">
  import { Button } from "$lib/components/ui/button";
  import InlineEditableCell from "$lib/components/atoms/InlineEditableCell.svelte";
  import TextInput from "$lib/components/atoms/TextInput.svelte";
  import { Plus, X } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  interface Props {
    tags?: string[];
    class?: string;
    onChange?: (tags: string[]) => void;
  }

  let { tags = [], class: className = "", onChange }: Props = $props();

  let isAdding = $state(false);
  let newTagValue = $state("");

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
</script>

<div class={cn("flex items-center gap-1.5 flex-wrap min-w-0", className)}>
  {#each tags as tag, index (tag + index)}
    <div
      class="group/pill inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted border border-border/60 text-muted-foreground hover:border-border transition-colors select-none"
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

  {#if isAdding}
    <TextInput
      autofocus
      bind:value={newTagValue}
      variant="inline"
      onblur={handleAddSubmit}
      onkeydown={handleKeyDown}
      placeholder="new tag"
      class="h-5 w-20 px-2 py-0 text-xs rounded-full border-primary/50 focus:outline-hidden focus:ring-1 focus:ring-primary/40 lowercase"
    />
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
      <Plus class="size-3" />
    </Button>
  {/if}
</div>
