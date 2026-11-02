<script lang="ts">
  import "../app.css";
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Explore from "$lib/components/templates/Explore.svelte";
  import Curate from "$lib/components/templates/Curate.svelte";
  import Vibe from "$lib/components/templates/Vibe.svelte";
  import Settings from "$lib/components/templates/Settings.svelte";
  import { library } from "$lib/core/library.svelte";
  import { player } from "$lib/core/player.svelte";
  import { playerSession } from "$lib/core/playerSession.svelte";
  import {
    getTrackDisplayAttribution,
    getTrackDisplayTitle,
  } from "$lib/utils/display";
  import NavigationRail, {
    type AppDeck,
  } from "$lib/components/molecules/NavigationRail.svelte";
  import NowPlaying from "$lib/components/organisms/NowPlaying.svelte";

  let activeDeck = $state<AppDeck>("curate");

  function handleKeyDown(event: KeyboardEvent) {
    // Top-level shortcuts (Cmd+1..3, Cmd+,)
    if (event.metaKey || event.ctrlKey) {
      switch (event.key) {
        case "1": {
          activeDeck = "explore";
          event.preventDefault();
          break;
        }
        case "2": {
          activeDeck = "curate";
          event.preventDefault();
          break;
        }
        case "3": {
          activeDeck = "vibe";
          event.preventDefault();
          break;
        }
        case ",": {
          activeDeck = "settings";
          event.preventDefault();
          break;
        }
      }
    }
  }
  onMount(async () => {
    await playerSession.setupCloseListener(player);

    const savedSession = await playerSession.loadSession();
    if (savedSession) {
      playerSession.rehydrate(player, library.tracks, savedSession);
    }
  });

  onDestroy(() => {
    playerSession.cleanup();
  });

  let pageTitle = $derived.by(() => {
    const track = player.currentTrack;
    const title = getTrackDisplayTitle(track);
    const attribution = getTrackDisplayAttribution(track);

    if (attribution && title) return `${attribution} - ${title}`;
    return title;
  });

  $effect(() => {
    const titleToSet = pageTitle;
    document.title = titleToSet;
    getCurrentWindow().setTitle(titleToSet);
  });
</script>

<svelte:window onkeydown={handleKeyDown} />

<div
  class="flex h-screen w-screen bg-background rounded-xl text-foreground overflow-hidden select-none"
>
  <NavigationRail {activeDeck} onSelectDeck={(deck) => (activeDeck = deck)} />

  <div class="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
    <main class="flex-1 min-h-0 w-full overflow-hidden relative">
      <div class="h-full w-full" class:hidden={activeDeck !== "curate"}>
        <Curate />
      </div>

      <div class="h-full w-full" class:hidden={activeDeck !== "vibe"}>
        <Vibe />
      </div>

      <div class="h-full w-full" class:hidden={activeDeck !== "explore"}>
        <Explore />
      </div>

      <div class="h-full w-full" class:hidden={activeDeck !== "settings"}>
        <Settings />
      </div>
    </main>
    <footer class="w-full shrink-0">
      <NowPlaying onTrackClick={() => (activeDeck = "vibe")} />
    </footer>
  </div>
</div>

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
