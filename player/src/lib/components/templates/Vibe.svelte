<!-- src/lib/components/templates/Vibe.svelte -->
<script lang="ts">
  import NowPlaying from "$lib/components/organisms/NowPlaying.svelte";

  interface Props {
    openSettings?: () => void;
    onToggleVibe?: () => void;
  }

  let { openSettings, onToggleVibe }: Props = $props();
</script>

<div class="flex h-full w-full flex-col min-w-0 overflow-hidden">
  <!-- Canvas Stage (Placeholder for Timeline / Visualizer / EQ) -->
  <main
    class="flex-1 min-h-0 w-full flex flex-col items-center justify-center rounded-xl border bg-card text-card-foreground shadow-xs select-none"
  >
    <div class="flex flex-col items-center gap-2 text-muted-foreground">
      <span class="text-xs font-mono uppercase tracking-widest"
        >Vibe Deck Canvas</span
      >
      <p class="text-xs text-muted-foreground/70">
        Click the playing track in the transport bar or press Esc to return to
        Curate view
      </p>
    </div>
  </main>

  <!-- Persistent Bottom Transport -->
  <footer class="w-full shrink-0 pt-2">
    <NowPlaying class="w-full" onTrackClick={onToggleVibe} />
  </footer>
</div>
