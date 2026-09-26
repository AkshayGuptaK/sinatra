<script lang="ts">
	import type { Component, Snippet } from 'svelte';
    import { cn } from '$lib/utils';

	interface Props {
		title: string;
        icon?: Component;
        class?: string;
		children?: Snippet;
	}

	let { title, icon: IconComponent, class: className = '', children }: Props = $props();
</script>

<div
	class={cn(
		'flex items-center gap-2 px-4 py-3 border-b bg-muted/20 select-none shrink-0',
		className
	)}
>
	{#if IconComponent}
		<IconComponent class="size-4 text-secondary-foreground shrink-0" />
	{/if}

	<h2 class="text-xs font-semibold uppercase tracking-wider text-secondary-foreground">
		{title}
	</h2>

	{#if children}
		{@render children()}
	{/if}
</div>