<script lang="ts">
  import "../app.css";
  import Player from "$lib/components/templates/Player.svelte";
  import { player } from "$lib/audio/player.svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";

  let pageTitle = $derived.by(() => {
    const track = player.currentTrack;
    if (!track) return "";

    const artist = track.artist?.trim();
    const title = track.title?.trim();

    if (artist && title) return `${artist} - ${title}`;
    return title || artist || "";
  });

  // Sync to native macOS window title bar
  $effect(() => {
    const titleToSet = pageTitle;
    document.title = titleToSet;
    getCurrentWindow().setTitle(titleToSet);
  });
</script>

<main
  data-skin="resonance"
  class="dark h-screen w-screen p-2 bg-background text-foreground overflow-hidden select-none"
>
  <Player/>
</main>

<style>
  :root {
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    font-size: 16px;
    line-height: 24px;
    font-weight: 400;

    color: #0f0f0f;
    background-color: #f6f6f6;

    font-synthesis: none;
    text-rendering: optimizeLegibility;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    -webkit-text-size-adjust: 100%;
  }
</style>
