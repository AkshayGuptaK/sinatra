<script lang="ts">
  import "../app.css";
  import NowPlaying from "$lib/components/organisms/NowPlaying.svelte";
  import ActiveQueue from "$lib/components/organisms/ActiveQueue.svelte";
  import Library from "$lib/components/organisms/Library.svelte";
</script>

<main class="flex h-screen w-screen p-4 bg-background text-foreground overflow-hidden select-none">
  <div class="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
    <div class="flex-1 min-h-0 w-full">
      <Library class="h-full w-full" />
    </div>

    <div class="w-full shrink-0">
      <NowPlaying class="w-full" />
    </div>
  </div>

  <aside class="w-80 lg:w-96 shrink-0 h-full flex flex-col">
    <ActiveQueue class="h-full w-full max-w-none" />
  </aside>
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
