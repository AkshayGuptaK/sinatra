<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { ListMusic, CirclePlus, MapPin } from '@lucide/svelte';
	import { cn } from '$lib/utils';

	export type LibraryViewMode = 'list' | 'map';

	interface Props {
		viewMode?: LibraryViewMode;
		disabled?: boolean;
		class?: string;
		onViewChange?: (mode: LibraryViewMode) => void;
		onEnqueueAll?: () => void;
	}

	let {
		viewMode = 'list',
		disabled = false,
		class: className = '',
		onViewChange,
		onEnqueueAll
	}: Props = $props();
</script>

<div class={cn('flex items-center gap-2 select-none', className)}>
	<!-- Enqueue All Matches -->
	<Button
		variant="ghost"
		size="icon"
		disabled={disabled}
        aria-label="Enqueue all filtered tracks"
        title="Enqueue all"
		onclick={onEnqueueAll}
		class="size-9 text-muted-foreground hover:text-foreground"
	>
		<CirclePlus class="size-5" />
	</Button>

	<!-- View Mode Switcher -->
	<div class="flex items-center rounded-lg border bg-muted/40 p-0.5 text-xs">
		<button
			type="button"
			onclick={() => onViewChange?.('list')}
            aria-label="Switch to List View"
            title="List View"
			class={cn(
				'flex items-center justify-center p-1.5 rounded-md transition-colors',
				viewMode === 'list'
					? 'bg-background font-medium text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'
			)}
		>
			<ListMusic class="size-5" />
		</button>
		<button
			type="button"
			onclick={() => onViewChange?.('map')}
            aria-label="Switch to Map View"
            title="Map View"
			class={cn(
				'flex items-center justify-center p-1.5 rounded-md transition-colors',
				viewMode === 'map'
					? 'bg-background font-medium text-foreground shadow-sm'
					: 'text-muted-foreground hover:text-foreground'
			)}
		>
			<MapPin class="size-5" />
		</button>
	</div>
</div>