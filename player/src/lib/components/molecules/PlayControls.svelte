<script lang="ts">
	import ToggleButton from '$lib/components/atoms/ToggleButton.svelte';
	import { Button } from '$lib/components/ui/button';
	import { RotateCcw, RotateCw, Play, Pause, Repeat } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	interface Props {
		isPlaying?: boolean;
		isLooping?: boolean;
		disabled?: boolean;
		class?: string;
		onPlayToggle?: (nextPlaying: boolean) => void;
		onSkipBackward?: () => void;
		onSkipForward?: () => void;
		onLoopToggle?: (nextLoop: boolean) => void;
	}

	let {
		isPlaying = false,
		isLooping = false,
		disabled = false,
		class: className = '',
		onPlayToggle,
		onSkipBackward,
		onSkipForward,
		onLoopToggle
	}: Props = $props();
</script>

<div class={cn('flex items-center gap-2 sm:gap-3', className)}>
	<!-- Skip Backward (-5s) -->
	<Button
		variant="ghost"
		size="icon"
		aria-label="Skip backward 5 seconds"
		title="Skip backward 5s"
		{disabled}
		onclick={onSkipBackward}
		class="relative text-muted-foreground hover:text-foreground transition-colors"
	>
		<RotateCcw class="size-5" />
		<span class="absolute text-[9px] font-bold mt-[1px]">5</span>
	</Button>

	<!-- Play / Pause Button -->
	<ToggleButton
		active={isPlaying}
		inactiveIcon={Play}
		activeIcon={Pause}
		inactiveLabel="Play"
		activeLabel="Pause"
		inactiveVariant="default"
		activeVariant="default"
		size="icon"
		{disabled}
		iconClass="size-5 fill-current"
		class="rounded-full size-11 shadow-md hover:scale-105 active:scale-95 transition-transform"
		onToggle={(next) => onPlayToggle?.(next)}
	/>

	<!-- Skip Forward (+5s) -->
	<Button
		variant="ghost"
		size="icon"
		aria-label="Skip forward 5 seconds"
		title="Skip forward 5s"
		{disabled}
		onclick={onSkipForward}
		class="relative text-muted-foreground hover:text-foreground transition-colors"
	>
		<RotateCw class="size-5" />
		<span class="absolute text-[9px] font-bold mt-[1px]">5</span>
	</Button>

	<!-- Loop On / Off Toggle -->
	<ToggleButton
		active={isLooping}
		inactiveIcon={Repeat}
		activeIcon={Repeat}
		inactiveLabel="Enable single track loop"
		activeLabel="Disable single track loop"
		inactiveVariant="ghost"
		activeVariant="secondary"
		size="icon"
		{disabled}
		iconClass="size-4"
		class={cn(
			'transition-colors',
			isLooping ? 'text-primary font-medium' : 'text-muted-foreground hover:text-foreground'
		)}
		onToggle={(next) => onLoopToggle?.(next)}
	/>
</div>