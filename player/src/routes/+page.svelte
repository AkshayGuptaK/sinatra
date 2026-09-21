<script lang="ts">
	import '../app.css';
  import { player } from "$lib/audio/player.svelte";
	import NowPlaying from '$lib/components/organisms/NowPlaying.svelte';

	const testTrackId = '4299b43f-39a3-4cf1-aeee-1bc9f40ed997';
  player.setQueue([{ id: testTrackId}])

</script>

<main class="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
	<NowPlaying />
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
