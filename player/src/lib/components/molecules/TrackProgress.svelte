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

  function handlePointerDown(e: PointerEvent) {
    // Only capture primary button (left click)
    if (e.button !== 0) return;

    isDragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerUp(e: PointerEvent) {
    if (!isDragging) return;

    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }

    seekToSecond(activeTime);
    isDragging = false;
  }

  function handlePointerCancel(e: PointerEvent) {
    if (isDragging) {
      const target = e.currentTarget as HTMLElement;
      if (target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
      isDragging = false;
    }
  }

  function handleSliderChange(val: number | number[]) {
    if (isDragging) {
      activeTime = Array.isArray(val) ? val[0] : val;
    }
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
    onpointerdown={handlePointerDown}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerCancel}
  >
    <Slider
      type="single"
      value={activeTime}
      min={0}
      max={totalDuration}
      step={0.1}
      disabled={disabled || !duration || duration <= 0}
      onValueChange={handleSliderChange}
      class={cn("cursor-pointer py-2",
             "[&_[data-slot=slider-range]]:bg-[linear-gradient(to_right,var(--primary),var(--accent-slider))]",
             "[&_[data-slot=slider-thumb]]:bg-[var(--accent-slider)]",
             "[&_[data-slot=slider-thumb]]:border-2",
             "[&_[data-slot=slider-thumb]]:border-background",
             "[&_[data-slot=slider-thumb]]:ring-1",
             "[&_[data-slot=slider-thumb]]:ring-border/60",
             "[&_[data-slot=slider-thumb]]:shadow-sm",
             !isDragging && "[&_[data-slot=slider-range]]:transition-all [&_[data-slot=slider-range]]:duration-200 [&_[data-slot=slider-range]]:ease-linear [&_[data-slot=slider-thumb]]:transition-all [&_[data-slot=slider-thumb]]:duration-200 [&_[data-slot=slider-thumb]]:ease-linear"
            )}
    />
  </div>

  <!-- Total Duration -->
  <span
    class="w-10 text-left font-mono text-xs tabular-nums text-muted-foreground"
  >
    {formatTime(duration ?? 0)}
  </span>
</div>
