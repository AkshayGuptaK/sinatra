<script lang="ts" generics="T">
  import type { Snippet } from "svelte";
  import { onMount } from "svelte";
  import { cn } from "$lib/utils";

  interface Props {
    items: T[];
    batchSize?: number;
    class?: string;
    children: Snippet<[item: T, index: number]>;
  }

  let {
    items,
    batchSize = 100,
    class: className = "",
    children,
  }: Props = $props();

  let displayCount = $state(100);
  let sentinelEl = $state<HTMLDivElement | null>(null);

  let visibleItems = $derived(items.slice(0, displayCount));

  $effect(() => {
    if (items.length < displayCount) {
      displayCount = Math.max(batchSize, items.length);
    }
  });

  onMount(() => {
    if (!sentinelEl) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting && displayCount < items.length) {
          displayCount = Math.min(displayCount + batchSize, items.length);
        }
      },
      { rootMargin: "250px" }
    );

    observer.observe(sentinelEl);
    return () => observer.disconnect();
  });
</script>

<div
  class={cn("flex-1 overflow-y-auto divide-y divide-border/20 p-1", className)}
>
  {#each visibleItems as item, index}
    {@render children(item, index)}
  {/each}

  <!-- Sentinel trigger: observed to increment displayCount before reaching bottom -->
  <div bind:this={sentinelEl} class="h-4 w-full"></div>
</div>
