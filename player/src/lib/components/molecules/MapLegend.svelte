<script lang="ts">
	import { EMOTION_COLORS } from '$lib/constants/emotions';
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
	}

	let { class: className = '' }: Props = $props();

	const sortedEmotions = $derived(
		Object.entries(EMOTION_COLORS)
			.map(([name, color]) => ({ name, color }))
			.sort((a, b) => a.name.localeCompare(b.name))
	);
</script>

<div
	class={cn(
		'flex flex-col gap-2 p-3 rounded-lg border border-border/70 bg-card/85 text-card-foreground shadow-lg backdrop-blur-md select-none w-60 shrink-0',
		className
	)}
>
	<h4 class="text-[10px] font-semibold uppercase tracking-wider text-secondary-foreground pb-1 border-b border-border/40">
		Emotions
	</h4>

	<div class="flex flex-col gap-2 mt-1">
		{#each sortedEmotions as { name, color }}
			<div class="flex items-center gap-3 text-xs">
				<span
					class="size-2.5 rounded-full shrink-0 shadow-xs"
					style="background-color: {color};"
				></span>
				<span class="truncate capitalize text-foreground/80 text-[11px] leading-tight">
					{name}
				</span>
			</div>
		{/each}
	</div>
</div>