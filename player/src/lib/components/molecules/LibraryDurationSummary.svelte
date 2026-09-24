<script lang="ts">
  import { formatTime } from "$lib/utils/time";
  import { cn } from "$lib/utils";

  interface Props {
    trackCount?: number;
    totalDuration?: number;
    class?: string;
  }

  let {
    trackCount = 0,
    totalDuration = 0,
    class: className = "",
  }: Props = $props();
</script>

<div
  class={cn(
    "flex items-center justify-between px-12 py-3 border-t text-xs text-muted-foreground font-mono select-none",
    className
  )}
>
  <span>
    {trackCount}
    {trackCount === 1 ? "track" : "tracks"}
  </span>
  <span>{formatTime(totalDuration)}</span>
</div>
