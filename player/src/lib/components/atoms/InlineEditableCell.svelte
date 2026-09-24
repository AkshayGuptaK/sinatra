<script lang="ts">
  import { tick } from "svelte";
  import { cn } from "$lib/utils";
  import TextInput from "$lib/components/atoms/TextInput.svelte";

  interface Props {
    value: string;
    placeholder?: string;
    class?: string;
    inputClass?: string;
    onSave: (newValue: string) => void;
  }

  let {
    value,
    placeholder = "-",
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
  <TextInput
    bind:ref={inputEl}
    bind:value={editValue}
    variant="inline"
    onblur={handleSave}
    onkeydown={handleKeyDown}
    onclick={stopEventPropagation}
    ondblclick={stopEventPropagation}
    onpointerdown={stopEventPropagation}
    class={cn(
      "border-primary/50 px-1.5 text-xs shadow-xs ring-1 ring-ring",
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
