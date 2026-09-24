<script lang="ts">
  import type { Snippet } from "svelte";
  import { ArrowUp, ArrowDown, ChevronsUpDown } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  export type SortDirection = "asc" | "desc" | null;

  interface Props {
    label?: string;
    sortDirection?: SortDirection;
    align?: "left" | "right";
    class?: string;
    children?: Snippet;
    onToggleSort?: () => void;
  }

  let {
    label = "",
    sortDirection = null,
    align = "left",
    class: className = "",
    children,
    onToggleSort,
  }: Props = $props();
</script>

<button
  type="button"
  onclick={onToggleSort}
  class={cn(
    "group inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider transition-colors hover:text-foreground cursor-pointer select-none focus:outline-hidden",
    sortDirection ? "text-foreground" : "text-muted-foreground",
    align === "right" ? "justify-end" : "justify-start",
    className
  )}
>
  {#if children}
    {@render children()}
  {:else}
    <span>{label}</span>
  {/if}

  <span class="inline-flex items-center">
    {#if sortDirection === "asc"}
      <ArrowUp class="size-3 text-primary shrink-0" />
    {:else if sortDirection === "desc"}
      <ArrowDown class="size-3 text-primary shrink-0" />
    {:else}
      <ChevronsUpDown
        class="size-3 opacity-0 group-hover:opacity-40 transition-opacity shrink-0"
      />
    {/if}
  </span>
</button>
