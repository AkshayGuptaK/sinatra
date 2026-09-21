<script lang="ts">
	import type { Track } from '$lib/audio/player.svelte';
	import { formatTime } from '$lib/utils/time';
	import { Volume2 } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	interface Props {
		track: Track;
		index: number;
		isActive?: boolean;
		isPlaying?: boolean;
		class?: string;
		onSelect?: (index: number) => void;
	}

	let {
		track,
		index,
		isActive = false,
		isPlaying = false,
		class: className = '',
		onSelect
	}: Props = $props();

	let displayTitle = $derived(track.title || 'Unknown Title');
	let displayArtist = $derived(track.artist || 'Unknown Artist');
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	onclick={() => onSelect?.(index)}
	class={cn(
		'group flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer select-none transition-colors text-sm',
		isActive
			? 'bg-accent/70 text-accent-foreground font-medium'
			: 'hover:bg-muted/50 text-foreground',
		className
	)}
>
	<!-- Playing Indicator -->
	<div class="flex items-center gap-3 min-w-0">
		<span class="w-5 text-center font-mono text-xs text-muted-foreground">
			{#if isActive && isPlaying}
				<Volume2 class="size-4 animate-pulse text-primary inline-block" />
			{/if}
		</span>

		<!-- Title & Artist -->
		<div class="flex flex-col min-w-0">
			<span class={cn('truncate font-medium', isActive && 'text-primary')}>
				{displayTitle}
			</span>
			<span class="truncate text-xs text-muted-foreground">
				{displayArtist}
			</span>
		</div>
	</div>

	<!-- Track Duration -->
	<span class="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
		{formatTime(track.duration ?? 0)}
	</span>
</div>