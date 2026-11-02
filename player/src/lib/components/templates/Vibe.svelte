<script lang="ts">
  import { slide } from "svelte/transition";
  import { player } from "$lib/core/player.svelte";
  import { library } from "$lib/core/library.svelte";
  import LyricsSidebar from "../molecules/LyricsSidebar.svelte";
  import Visualizer from "../organisms/Visualizer.svelte";

  let isLyricsOpen = $state(false);

  // Lazy-fetch lyrics into `library.tracks` only when sidebar is open
  $effect(() => {
    const trackId = player.currentTrack?.id;
    if (isLyricsOpen && trackId) {
      library.ensureTrackLyrics(trackId);
    }
  });
</script>

<div class="flex h-full w-full flex-col min-w-0 overflow-hidden">
  <div class="flex flex-1 min-h-0 w-full overflow-hidden">
    <main
      class="flex-1 min-w-0 h-full overflow-hidden transition-all duration-300"
    >
      <Visualizer
        {isLyricsOpen}
        onToggleLyrics={() => (isLyricsOpen = !isLyricsOpen)}
        class="h-full w-full"
      />
    </main>

    <!-- Lyrics Sidebar -->
    {#if isLyricsOpen}
      <aside
        transition:slide={{ axis: "x", duration: 250 }}
        class="w-80 lg:w-96 shrink-0 h-full flex flex-col overflow-hidden"
      >
        <LyricsSidebar
          lyrics={player.currentTrack?.lyrics}
          isLoading={library.isLoadingLyrics}
          disabled={!player.currentTrack}
          onSave={async (lyrics) => {
            if (player.currentTrack) {
              await library.updateTrackMetadata(player.currentTrack.id, {
                lyrics,
              });
            }
          }}
          onClose={() => (isLyricsOpen = false)}
          class="h-full w-full"
        />
      </aside>
    {/if}
  </div>
</div>
