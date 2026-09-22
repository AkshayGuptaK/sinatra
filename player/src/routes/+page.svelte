<script lang="ts">
  import "../app.css";
  import { player } from "$lib/audio/player.svelte";
  import { type Track } from "$lib/types/track"
  import NowPlaying from "$lib/components/organisms/NowPlaying.svelte";
  import ActiveQueue from "$lib/components/organisms/ActiveQueue.svelte";
  import Library from "$lib/components/organisms/Library.svelte";
  import { onMount } from "svelte";

  // Sample tracks with initial metadata for quick testing
  const samplePlaylist: Track[] = [
    {
      id: "1206c87a-ed13-428f-8fea-055041cf2361",
      title: "Natsu Machi",
      artist: "Aria",
      duration: 345,
    },
    {
      id: "f0aeed01-5aa3-497d-b50e-844a734ad96e",
      title: "Moon River",
      artist: "Frank Sinatra",
      duration: 198,
    },
  ];

  onMount(() => {
    if (player.queue.length === 0) {
      player.setQueue(samplePlaylist, 0, false);
    }
  });
</script>

<main
  class="flex min-h-screen items-end justify-center p-6 bg-background"
>
    <div>
      <Library />
      <NowPlaying />
    </div>
  <ActiveQueue />
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
