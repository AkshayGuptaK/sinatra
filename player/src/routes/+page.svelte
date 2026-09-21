<script lang="ts">
	import '../app.css';
	import PlayControls from '$lib/components/molecules/PlayControls.svelte';
	import { player } from '$lib/audio/player.svelte';

	const testTrackId = '4299b43f-39a3-4cf1-aeee-1bc9f40ed997';

	async function handlePlayToggle() {
		// If queue is empty or no track has been loaded, load the test track into queue
		if (!player.currentTrackId) {
			player.setQueue([testTrackId], 0, true);
		} else {
			player.engine.togglePlay();
		}
	}
</script>

<main class="flex min-h-screen flex-col items-center justify-center p-6 bg-background">
	<div class="flex flex-col items-center gap-4 p-6 rounded-xl border bg-card text-card-foreground shadow-lg">
		<div class="text-sm font-medium text-muted-foreground">
			{player.engine.isPlaying ? 'Playing track' : 'Ready'}
		</div>

		<!-- Play Controls Molecule -->
		<PlayControls
			isPlaying={player.engine.isPlaying}
			isLooping={player.loopMode === 'one'}
			onPlayToggle={handlePlayToggle}
			onSkipBackward={() => player.engine.seekRelative(-5)}
			onSkipForward={() => player.engine.seekRelative(5)}
			onLoopToggle={() => {
				player.setLoopMode(player.loopMode === 'one' ? 'none' : 'one');
			}}
		/>
	</div>
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

a {
  font-weight: 500;
  color: #646cff;
  text-decoration: inherit;
}

a:hover {
  color: #535bf2;
}

h1 {
  text-align: center;
}

input,
button {
  border-radius: 8px;
  border: 1px solid transparent;
  padding: 0.6em 1.2em;
  font-size: 1em;
  font-weight: 500;
  font-family: inherit;
  color: #0f0f0f;
  background-color: #ffffff;
  transition: border-color 0.25s;
  box-shadow: 0 2px 2px rgba(0, 0, 0, 0.2);
}

button {
  cursor: pointer;
}

button:hover {
  border-color: #396cd8;
}
button:active {
  border-color: #396cd8;
  background-color: #e8e8e8;
}

input,
button {
  outline: none;
}

#greet-input {
  margin-right: 5px;
}

@media (prefers-color-scheme: dark) {
  :root {
    color: #f6f6f6;
    background-color: #2f2f2f;
  }

  a:hover {
    color: #24c8db;
  }

  input,
  button {
    color: #ffffff;
    background-color: #0f0f0f98;
  }
  button:active {
    background-color: #0f0f0f69;
  }
}

</style>
