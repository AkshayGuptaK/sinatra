<script lang="ts">
	import type { Component } from 'svelte';
	import type { ButtonProps } from '$lib/components/ui/button';
	import { Button } from '$lib/components/ui/button';
	import { cn } from '$lib/utils';

	interface Props {
		/** The current binary or toggle state */
		active?: boolean;
		/** Icon to show when active is false */
		inactiveIcon: Component<{ class?: string }>;
		/** Icon to show when active is true */
		activeIcon: Component<{ class?: string }>;
		/** Accessible label describing the action when inactive (e.g. "Play") */
		inactiveLabel?: string;
		/** Accessible label describing the action when active (e.g. "Pause") */
		activeLabel?: string;
		/** Action to fire when clicking in inactive state */
		onActivate?: () => void;
		/** Action to fire when clicking in active state */
		onDeactivate?: () => void;
		/** Optional general toggle handler passing next boolean */
		onToggle?: (nextState: boolean) => void;
		/** shadcn-svelte Button variant when inactive */
		inactiveVariant?: ButtonProps['variant'];
		/** shadcn-svelte Button variant when active */
		activeVariant?: ButtonProps['variant'];
		/** Button size preset */
		size?: ButtonProps['size'];
		/** Extra classes for the button */
		class?: string;
		/** Extra classes for the icon */
		iconClass?: string;
		disabled?: boolean;
	}

	let {
		active = false,
		inactiveIcon: InactiveIcon,
		activeIcon: ActiveIcon,
		inactiveLabel = 'Toggle on',
		activeLabel = 'Toggle off',
		onActivate,
		onDeactivate,
		onToggle,
		inactiveVariant = 'ghost',
		activeVariant = 'ghost',
		size = 'icon',
		class: className = '',
		iconClass = 'size-5',
		disabled = false,
		...restProps
	}: Props = $props();

	function handleClick(event: MouseEvent) {
		event.stopPropagation();
		if (active) {
			onDeactivate?.();
			onToggle?.(false);
		} else {
			onActivate?.();
			onToggle?.(true);
		}
	}

	let currentVariant = $derived(active ? activeVariant : inactiveVariant);
	let currentLabel = $derived(active ? activeLabel : inactiveLabel);
</script>

<Button
	variant={currentVariant}
	{size}
	aria-label={currentLabel}
	title={currentLabel}
	onclick={handleClick}
	{disabled}
	class={cn('transition-all select-none', className)}
	{...restProps}
>
	{#if active}
		<ActiveIcon class={cn(iconClass, 'transition-transform')} />
	{:else}
		<InactiveIcon class={cn(iconClass, 'transition-transform')} />
	{/if}
</Button>