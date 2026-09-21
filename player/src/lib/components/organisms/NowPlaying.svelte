<script lang="ts">
	import PlayControls from '$lib/components/molecules/PlayControls.svelte';
	import TrackProgress from '$lib/components/molecules/TrackProgress.svelte';
	import { player } from '$lib/audio/player.svelte';
	import { cn } from '$lib/utils';

	interface Props {
		defaultTrackId?: string;
		class?: string;
	}

	let {
		defaultTrackId,
		class: className = ''
	}: Props = $props();

	async function handlePlayToggle() {
		if (!player.currentTrackId && defaultTrackId) {
			player.setQueue([defaultTrackId], 0, true);
		} else {
			player.engine.togglePlay();
		}
	}

	function handleLoopToggle() {
		player.setLoopMode(player.loopMode === 'one' ? 'none' : 'one');
	}
</script>

<div
	class={cn(
		'flex flex-col items-center gap-4 w-full max-w-md p-6 rounded-xl border bg-card text-card-foreground shadow-lg',
		className
	)}
>
	<!-- Track State Header -->
	<div class="text-sm font-medium text-muted-foreground">
		{player.engine.isPlaying ? 'Playing track' : 'Ready'}
	</div>

	<!-- Transport Controls -->
	<PlayControls
		isPlaying={player.engine.isPlaying}
		isLooping={player.loopMode === 'one'}
		onPlayToggle={handlePlayToggle}
		onSkipBackward={() => player.engine.seekRelative(-5)}
		onSkipForward={() => player.engine.seekRelative(5)}
		onLoopToggle={handleLoopToggle}
	/>

	<!-- Scrub / Progress Slider -->
	<TrackProgress
		currentTime={player.engine.currentTime}
		duration={player.engine.duration}
		disabled={!player.currentTrackId && !defaultTrackId}
		onSeek={(time) => player.engine.seekTo(time)}
	/>
</div>