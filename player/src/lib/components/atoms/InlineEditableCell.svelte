<script lang="ts">
  import { tick } from "svelte";
  import { cn } from "$lib/utils";

  interface Props {
    value: string;
    placeholder?: string;
    class?: string;
    inputClass?: string;
    onSave: (newValue: string) => void;
  }

  let {
    value,
    placeholder = "Empty",
    class: className = "",
    inputClass = "",
    onSave,
  }: Props = $props();

  let isEditing = $state(false);
  let editValue = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);

  function stopEventPropagation(e: Event) {
    e.stopPropagation();
  }

  async function startEditing(e: MouseEvent) {
    stopEventPropagation(e);
    editValue = value || "";
    isEditing = true;
    await tick();
    inputEl?.focus();
    inputEl?.select();
  }

  function handleSave() {
    if (!isEditing) return;
    isEditing = false;
    const trimmed = editValue.trim();
    if (trimmed !== value) {
      onSave(trimmed);
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      stopEventPropagation(e);
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      isEditing = false;
    }
  }
</script>

{#if isEditing}
  <input
    bind:this={inputEl}
    type="text"
    bind:value={editValue}
    onblur={handleSave}
    onkeydown={handleKeyDown}
    onclick={stopEventPropagation}
    ondblclick={stopEventPropagation}
    onpointerdown={stopEventPropagation}
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    spellcheck="false"
    class={cn(
      "w-full bg-background border border-primary/50 text-foreground px-1.5 py-0.5 rounded text-xs outline-none shadow-xs ring-1 ring-ring",
      inputClass
    )}
  />
{:else}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span
    onclick={startEditing}
    title="Click to edit"
    class={cn(
      "truncate cursor-pointer hover:decoration-muted-foreground/50 hover:bg-muted/40 px-1 py-0.5 rounded transition-colors",
      !value && "italic text-muted-foreground/60",
      className
    )}
  >
    {value || placeholder}
  </span>
{/if}
