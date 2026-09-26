<script lang="ts">
  import ToggleButton from "$lib/components/atoms/ToggleButton.svelte";
  import ControlButton from "$lib/components/atoms/ControlButton.svelte";
  import { RotateCcw, RotateCw, Play, Pause, Repeat2 } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  interface Props {
    isPlaying?: boolean;
    isLooping?: boolean;
    disabled?: boolean;
    class?: string;
    onPlayToggle: (nextPlaying: boolean) => void;
    onSkipBackward: () => void;
    onSkipForward: () => void;
    onLoopToggle: (nextLoop: boolean) => void;
  }

  let {
    isPlaying = false,
    isLooping = false,
    disabled = false,
    class: className = "",
    onPlayToggle,
    onSkipBackward,
    onSkipForward,
    onLoopToggle,
  }: Props = $props();
</script>

<div class={cn("flex items-center gap-2 sm:gap-3", className)}>
  <!-- Skip Backward (-5s) -->
  <ControlButton
    icon={RotateCcw}
    label="Skip backward 5 seconds"
    title="Skip backward 5s"
    onClick={onSkipBackward}
    class="relative"
  >
    <span class="absolute text-[9px] font-bold mt-[1px]">5</span>
  </ControlButton>

  <!-- Play / Pause Button -->
  <ToggleButton
    active={isPlaying}
    inactiveIcon={Play}
    activeIcon={Pause}
    inactiveLabel="Play"
    activeLabel="Pause"
    inactiveVariant="default"
    activeVariant="default"
    size="icon"
    {disabled}
    iconClass="size-5 fill-current"
    class="rounded-full size-11 shadow-md hover:scale-105 active:scale-95 transition-transform ring-1 ring-white/20 shadow-[0_2px_8px_-1px_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.2)]"
    onToggle={(next) => onPlayToggle?.(next)}
  />

  <!-- Skip Forward (+5s) -->
  <ControlButton
    icon={RotateCw}
    label="Skip forward 5 seconds"
    title="Skip forward 5s"
    onClick={onSkipForward}
    class="relative"
  >
    <span class="absolute text-[9px] font-bold mt-[1px]">5</span>
  </ControlButton>

  <!-- Loop On / Off Toggle -->
  <ToggleButton
    active={isLooping}
    inactiveIcon={Repeat2}
    activeIcon={Repeat2}
    inactiveLabel="Enable single track loop"
    activeLabel="Disable single track loop"
    inactiveVariant="ghost"
    activeVariant="secondary"
    size="icon"
    {disabled}
    iconClass="size-4"
    class={cn(
      "transition-colors",
      isLooping
        ? "text-primary font-medium"
        : "text-muted-foreground hover:text-foreground"
    )}
    onToggle={(next) => onLoopToggle?.(next)}
  />
</div>
