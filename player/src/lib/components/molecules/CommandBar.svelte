<script lang="ts">
	import { Search, Sparkles, Funnel, X } from '@lucide/svelte';
	import { Input } from '$lib/components/ui/input';
	import { Button } from '$lib/components/ui/button';
	import { parseCommandInput, type ParsedIntent } from '$lib/utils/commandParser';
	import { cn } from '$lib/utils';

	interface Props {
		class?: string;
		onSearchChange?: (intent: ParsedIntent) => void;
		onCommandSubmit?: (intent: ParsedIntent) => void;
	}

	let { class: className = '', onSearchChange, onCommandSubmit }: Props = $props();

	let rawInput = $state('');
	let isFocused = $state(false);
	let selectedSuggestionIndex = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);

	const COMMAND_SUGGESTIONS = [
		{ prefix: '/play', label: '/play <prompt>', desc: 'Replace queue with prompted music' },
		{ prefix: '/queue', label: '/queue <prompt>', desc: 'Add prompted music to the queue' },
		{ prefix: ':artist', label: ':artist <name>', desc: 'Filter library strictly by artist' },
		{ prefix: ':album', label: ':album <name>', desc: 'Filter library strictly by album' },
		{ prefix: ':mood', label: ':mood <name>', desc: 'Filter library strictly by mood cluster' }
	];

	// Derive matching suggestions when typing / or :
	let matchingSuggestions = $derived.by(() => {
		const val = rawInput.trim();
		if (val.startsWith('/') || val.startsWith(':')) {
			return COMMAND_SUGGESTIONS.filter((s) => s.prefix.startsWith(val.split(' ')[0]));
		}
		return [];
	});

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		rawInput = target.value;
		const parsed = parseCommandInput(rawInput);
		onSearchChange?.(parsed);
	}

	function handleKeydown(e: KeyboardEvent) {
		if (matchingSuggestions.length > 0) {
			if (e.key === 'ArrowDown') {
				e.preventDefault();
				selectedSuggestionIndex = (selectedSuggestionIndex + 1) % matchingSuggestions.length;
				return;
			}
			if (e.key === 'ArrowUp') {
				e.preventDefault();
				selectedSuggestionIndex =
					(selectedSuggestionIndex - 1 + matchingSuggestions.length) % matchingSuggestions.length;
				return;
			}
			if (e.key === 'Tab' || (e.key === 'Enter' && rawInput === matchingSuggestions[selectedSuggestionIndex]?.prefix)) {
				e.preventDefault();
				rawInput = matchingSuggestions[selectedSuggestionIndex].prefix + ' ';
				onSearchChange?.(parseCommandInput(rawInput));
				return;
			}
		}

		if (e.key === 'Enter') {
			e.preventDefault();
			const parsed = parseCommandInput(rawInput);
			onCommandSubmit?.(parsed);
		} else if (e.key === 'Escape') {
			rawInput = '';
			onSearchChange?.({ type: 'text_search', query: '' });
			inputEl?.blur();
		}
	}

	function selectSuggestion(prefix: string) {
		rawInput = prefix + ' ';
		onSearchChange?.(parseCommandInput(rawInput));
		inputEl?.focus();
	}

	function clearInput() {
		rawInput = '';
		onSearchChange?.({ type: 'text_search', query: '' });
		inputEl?.focus();
	}
</script>

<div class={cn('relative w-full max-w-xl', className)}>
	<div class="relative flex items-center">
		<!-- Dynamic Left Indicator Icon -->
		<div class="absolute left-3 z-10 flex items-center pointer-events-none text-muted-foreground">
			{#if rawInput.startsWith('/')}
				<Sparkles class="size-4 shrink-0 text-primary animate-pulse" />
			{:else if rawInput.startsWith(':')}
				<Funnel class="size-4 shrink-0 text-primary" />
			{:else}
				<Search class="size-4 shrink-0" />
			{/if}
		</div>

		<!-- Input Element -->
		<Input
			bind:ref={inputEl}
			type="text"
			placeholder="Search songs, :artist, or /play something upbeat... (Esc to clear)"
			value={rawInput}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onfocus={() => (isFocused = true)}
			onblur={() => setTimeout(() => (isFocused = false), 150)}
			class="pl-9 pr-9 h-10 w-full bg-background/80 backdrop-blur border-muted-foreground/30 focus-visible:ring-1"
		/>

		<!-- Clear Action Button -->
		{#if rawInput.length > 0}
			<Button
				variant="ghost"
				size="icon"
				onclick={clearInput}
				class="absolute right-1 size-7 text-muted-foreground hover:text-foreground"
			>
				<X class="size-3.5" />
			</Button>
		{/if}
	</div>

	<!-- Autocomplete / Suggestions Dropdown (Opens Downward) -->
	{#if isFocused && matchingSuggestions.length > 0}
		<div
			class="absolute top-full left-0 right-0 mt-1.5 p-1 bg-popover text-popover-foreground border rounded-lg shadow-xl z-50 overflow-hidden text-xs"
		>
			{#each matchingSuggestions as sug, idx}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					onclick={() => selectSuggestion(sug.prefix)}
					class={cn(
						'flex items-center justify-between px-3 py-2 rounded-md cursor-pointer transition-colors',
						idx === selectedSuggestionIndex ? 'bg-accent text-accent-foreground font-medium' : 'hover:bg-muted/50'
					)}
				>
					<span class="font-mono text-primary">{sug.label}</span>
					<span class="text-muted-foreground text-[11px]">{sug.desc}</span>
				</div>
			{/each}
		</div>
	{/if}
</div>