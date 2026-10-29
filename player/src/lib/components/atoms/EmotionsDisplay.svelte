<script lang="ts">
  import { cn } from "$lib/utils";

  interface Props {
    class?: string;
    sortedEmotions: { name: string; pct: number }[];
  }

  let { class: className = "", sortedEmotions = [] }: Props = $props();
</script>

<div class={cn("mt-2 space-y-1.5 pr-1", className)}>
  {#if sortedEmotions.length > 0}
    {#each sortedEmotions as emotion}
      <div class="space-y-0.5">
        <div class="flex justify-between text-[11px]">
          <span class="text-muted-foreground capitalize">{emotion.name}</span>
          <span class="font-mono text-[10px] font-semibold text-foreground/80"
            >{emotion.pct}%</span
          >
        </div>
        <div class="h-1 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            class="h-full rounded-full bg-primary/70 transition-all duration-300"
            style="width: {emotion.pct}%"
          ></div>
        </div>
      </div>
    {/each}
  {:else}
    <p class="py-1 text-center text-xs italic text-muted-foreground">
      No emotion scores available
    </p>
  {/if}
</div>
