<script lang="ts">
  import "../app.css";
  import { onMount, onDestroy } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Curate from "$lib/components/templates/Curate.svelte";
  import Vibe from "$lib/components/templates/Vibe.svelte";
  import SettingsDialog from "$lib/components/organisms/SettingsDialog.svelte";
  import { library } from "$lib/core/library.svelte";
  import { player } from "$lib/core/player.svelte";
  import { playerSession } from "$lib/core/playerSession.svelte";
  import {
    getTrackDisplayAttribution,
    getTrackDisplayTitle,
  } from "$lib/utils/display";

  type AppDeck = "curate" | "vibe";
  let activeDeck = $state<AppDeck>("curate");
  let isSettingsOpen = $state(false);

  function handleToggleDeck() {
    activeDeck = activeDeck === "curate" ? "vibe" : "curate";
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (
      event.key === "Escape" &&
      activeDeck === "vibe" &&
      !(document.activeElement instanceof HTMLInputElement)
    ) {
      activeDeck = "curate";
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

<main
  class="h-screen w-screen p-2 bg-background text-foreground overflow-hidden select-none"
>
  {#if activeDeck === "curate"}
    <Curate
      openSettings={() => (isSettingsOpen = true)}
      onToggleVibe={handleToggleDeck}
    />
  {:else}
    <Vibe
      openSettings={() => (isSettingsOpen = true)}
      onToggleVibe={handleToggleDeck}
    />
  {/if}
  <SettingsDialog bind:open={isSettingsOpen} />
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
