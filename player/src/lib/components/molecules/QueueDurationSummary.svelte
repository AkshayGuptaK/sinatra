<script lang="ts">
	import { formatTime } from '$lib/utils/time';
	import { cn } from '$lib/utils';

	interface Props {
		trackCount?: number;
		totalDuration?: number;
		elapsedDuration?: number;
		class?: string;
	}

	let {
		trackCount = 0,
		totalDuration = 0,
		elapsedDuration = 0,
		class: className = ''
	}: Props = $props();
</script>

<div
	class={cn(
		'flex items-center justify-between px-4 py-3 border-t text-xs text-muted-foreground font-mono select-none',
		className
	)}
>
	<!-- Track Count -->
	<span>
		{trackCount} {trackCount === 1 ? 'track' : 'tracks'}
	</span>

	<!-- Progress / Total Duration -->
	<div class="flex items-center gap-1.5 tabular-nums">
		<span class="text-secondary-foreground font-medium">{formatTime(elapsedDuration)}</span>
		<span>/</span>
		<span>{formatTime(totalDuration)}</span>
	</div>
</div>