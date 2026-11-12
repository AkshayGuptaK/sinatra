<script lang="ts">
  import type { MoodCategoryItem } from "$lib/api/explore";
  import { cn } from "$lib/utils";

  export interface Props {
    categories: Record<string, MoodCategoryItem[]>;
    activeCategory?: MoodCategoryItem | null;
    class?: string;
    onSelect?: (category: MoodCategoryItem) => void;
  }

  let {
    categories,
    activeCategory = null,
    class: className = "",
    onSelect,
  }: Props = $props();

  const sections = $derived(
    Object.entries(categories).filter(([, items]) => items && items.length > 0)
  );
</script>

{#if sections.length > 0}
  <div class={cn("flex flex-col gap-6 w-full pt-5 border-t border-neutral-800/60", className)}>
    {#each sections as [heading, items] (heading)}
      <section class="flex flex-col gap-2.5">
        <h3 class="text-xs font-bold uppercase tracking-wider text-neutral-400">
          {heading}
        </h3>

        <div
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2"
        >
          {#each items as item (`${item.params}-${item.title}`)}
            {@const isSelected = activeCategory?.params === item.params}
            <button
              type="button"
              onclick={() => onSelect?.(item)}
              title={item.title}
              class={cn(
                "group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left text-xs font-medium select-none transition-all duration-150 cursor-pointer outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60",
                isSelected
                  ? "bg-neutral-800/90 border-primary text-primary shadow-xs"
                  : "bg-neutral-900/50 border-neutral-800/80 text-neutral-200 hover:bg-neutral-800/70 hover:border-neutral-700/80 hover:text-white active:bg-neutral-800"
              )}
            >
              <span
                class={cn(
                  "w-1 h-3.5 rounded-full shrink-0 transition-colors",
                  isSelected
                    ? "bg-primary"
                    : "bg-neutral-700 group-hover:bg-secondary-foreground"
                )}
              ></span>
              <span class="truncate">{item.title}</span>
            </button>
          {/each}
        </div>
      </section>
    {/each}
  </div>
{/if}
