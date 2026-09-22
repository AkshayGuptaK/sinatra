<script lang="ts">
  import { Slider } from "$lib/components/ui/slider";
  import { formatTime } from "$lib/utils/time";
  import { cn } from "$lib/utils";

  interface Props {
    currentTime?: number;
    duration?: number;
    disabled?: boolean;
    onSeek?: (time: number) => void;
  }

  let { currentTime, duration, onSeek, disabled }: Props = $props();

  let isDragging = $state(false);
  let scrubPosition = $state(0);
  let activeTime = $derived(isDragging ? scrubPosition : (currentTime ?? 0));
  let totalDuration = $derived(duration && duration > 0 ? duration : 100);

  function updateScrubPosition(value: number) {
    scrubPosition = value;
  }

  function seekToSecond(value: number) {
    onSeek?.(value);
  }
</script>

<div class={cn("flex w-full items-center gap-3 select-none")}>
  <!-- Elapsed Time -->
  <span
    class="w-10 text-right font-mono text-xs tabular-nums text-muted-foreground"
  >
    {formatTime(activeTime)}
  </span>

  <!-- Progress / Scrub Bar -->
   <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="relative flex-1"
    onpointerdown={() => {
      isDragging = true;
    }}
    onpointerup={() => {
      seekToSecond(activeTime);
      isDragging = false;
    }}
  >
    <Slider
      type="single"
      value={activeTime}
      min={0}
      max={totalDuration}
      step={0.5}
      disabled={disabled || !duration || duration <= 0}
      onValueChange={updateScrubPosition}
      class="cursor-pointer py-2
             [&_[data-slot=slider-range]]:bg-[linear-gradient(to_right,var(--primary),var(--accent-slider))]"
    />
  </div>

  <!-- Total Duration -->
  <span
    class="w-10 text-left font-mono text-xs tabular-nums text-muted-foreground"
  >
    {formatTime(duration ?? 0)}
  </span>
</div>
