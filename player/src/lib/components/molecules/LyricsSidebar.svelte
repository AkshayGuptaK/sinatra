<!-- src/lib/components/molecules/LyricsSidebar.svelte -->
<script lang="ts">
  import { tick } from "svelte";
  import { Mic, Pencil, Save, X, Undo2, Loader } from "@lucide/svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import { cn } from "$lib/utils";
  import HeaderBanner from "./HeaderBanner.svelte";

  interface Props {
    lyrics?: string | null;
    isLoading?: boolean;
    disabled?: boolean;
    class?: string;
    onSave?: (newLyrics: string) => Promise<void>;
    onClose?: () => void;
  }

  let {
    lyrics = "",
    isLoading = false,
    disabled = false,
    class: className = "",
    onSave,
    onClose,
  }: Props = $props();

  let isEditing = $state(false);
  let isSaving = $state(false);
  let draftLyrics = $state("");
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  // Sync draft whenever track or lyrics prop updates while not actively typing
  $effect(() => {
    draftLyrics = lyrics ?? "";
    isEditing = false;
  });

  async function enterEditMode() {
    draftLyrics = lyrics ?? "";
    isEditing = true;
    await tick();
    textareaEl?.focus();
  }

  function cancelEdit() {
    draftLyrics = lyrics ?? "";
    isEditing = false;
  }

  async function handleSave() {
    if (isSaving || !onSave) return;
    isSaving = true;
    try {
      await onSave?.(draftLyrics.trim());
      isEditing = false;
    } finally {
      isSaving = false;
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    // Cmd+Enter or Ctrl+Enter to save immediately from keyboard
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    }
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden select-none",
    className
  )}
>
  <!-- Card Header Banner -->
   <HeaderBanner title="Lyrics" icon={Mic}>
    <div class="flex items-center gap-1 shrink-0">
      {#if isEditing}
        <ControlButton
          icon={Undo2}
          label="Cancel editing"
          title="Cancel (Esc)"
          disabled={isSaving}
          onClick={cancelEdit}
          class="size-4"
          iconClass="size-4"
        />

        <ControlButton
          icon={isSaving ? Loader : Save}
          label="Save lyrics"
          title="Save lyrics (Cmd+Enter)"
          disabled={isSaving}
          onClick={handleSave}
          class="size-4"
          iconClass={cn("size-4", isSaving && "animate-spin")}
        />
      {:else}
        <ControlButton
          icon={Pencil}
          label="Edit lyrics"
          title="Edit lyrics"
          disabled={disabled || isLoading}
          onClick={enterEditMode}
          class="size-4"
          iconClass="size-4"
        />
      {/if}

      {#if onClose}
        <ControlButton
          icon={X}
          label="Close lyrics sidebar"
          title="Close lyrics"
          onClick={onClose}
          class="size-4 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          iconClass="size-4"
        />
      {/if}
    </div>
   </HeaderBanner>

  <!-- Content Body -->
  <div class="flex-1 min-h-0 w-full overflow-hidden flex flex-col p-4">
    {#if isLoading}
      <div class="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Loader class="size-5 animate-spin text-primary/60" />
        <span class="text-xs font-mono">Loading lyrics...</span>
      </div>
    {:else if isEditing}
      <!-- Edit Mode: Multi-line Editor -->
      <div class="flex-1 min-h-0 flex flex-col gap-2">
        <textarea
          bind:this={textareaEl}
          bind:value={draftLyrics}
          onkeydown={handleKeyDown}
          placeholder="Paste or type lyrics here..."
          class="flex-1 min-h-0 w-full p-3 rounded-lg border border-border/80 bg-background/50 text-foreground text-sm leading-relaxed font-sans placeholder:text-muted-foreground/50 resize-none focus:outline-hidden focus:ring-1 focus:ring-primary overflow-y-auto select-text"
        ></textarea>
        <span class="text-[10px] text-muted-foreground/60 text-right pr-1">
          Press <strong>Cmd+Enter</strong> to save, <strong>Esc</strong> to cancel
        </span>
      </div>
    {:else if lyrics && lyrics.trim().length > 0}
      <!-- Display Mode: Formatted Lyrics -->
      <div
        class="flex-1 min-h-0 overflow-y-auto pr-1 select-text scroll-smooth"
      >
        <p
          class="text-sm font-medium leading-loose text-foreground/90 whitespace-pre-wrap font-sans"
        >
          {lyrics}
        </p>
      </div>
    {:else}
      <!-- Empty State -->
      <div
        class="flex-1 min-h-0 flex flex-col items-center justify-center text-center p-6 gap-2 text-muted-foreground"
      >
        <Mic class="size-8 stroke-[1.25] text-muted-foreground/40" />
        <p class="text-xs font-medium">No lyrics available for this track</p>
        <button
          type="button"
          onclick={enterEditMode}
          class="text-xs text-primary hover:underline cursor-pointer pt-1"
        >
          Add lyrics
        </button>
      </div>
    {/if}
  </div>
</div>
