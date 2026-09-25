<!-- src/lib/components/molecules/VolumeControl.svelte -->
<script lang="ts">
  import ToggleButton from "$lib/components/atoms/ToggleButton.svelte";
  import { Slider } from "$lib/components/ui/slider";
  import { Volume2, Volume1, VolumeX } from "@lucide/svelte";
  import { cn } from "$lib/utils";

  interface Props {
    volume?: number;
    setVolume: (nextVolume: number) => void;
    disabled?: boolean;
    class?: string;
  }

  let {
    volume = 1,
    setVolume,
    disabled = false,
    class: className = "",
  }: Props = $props();

  // Preserved volume level prior to clicking mute
  let rememberedVolume = $state<number | null>(null);

  let isMuted = $derived(volume === 0);

  // Choose appropriate active icon based on volume level
  let ActiveVolumeIcon = $derived(volume < 0.5 ? Volume1 : Volume2);

  function handleMuteToggle() {
    if (disabled) return;

    if (isMuted) {
      // Unmute: restore remembered volume, fallback to 0.7 if previously 0
      const targetVolume =
        rememberedVolume && rememberedVolume > 0 ? rememberedVolume : 0.7;
      setVolume(targetVolume);
      rememberedVolume = null;
    } else {
      // Mute: store current volume and set output to 0
      rememberedVolume = volume;
      setVolume(0);
    }
  }

  function handleSliderChange(val: number) {
    if (disabled) return;

    // Interacting with the slider clears muting and clears remembered memory
    rememberedVolume = null;
    setVolume(val);
  }
</script>

<div class={cn("flex items-center gap-2 select-none", className)}>
  <!-- Mute / Unmute Toggle Button Atom -->
  <ToggleButton
    active={!isMuted}
    inactiveIcon={VolumeX}
    activeIcon={ActiveVolumeIcon}
    inactiveLabel="Unmute volume"
    activeLabel="Mute volume"
    inactiveVariant="ghost"
    activeVariant="ghost"
    size="icon"
    {disabled}
    iconClass="size-4"
    class={cn(
      "transition-colors",
      isMuted
        ? "text-destructive hover:text-destructive"
        : "text-muted-foreground hover:text-foreground"
    )}
    onToggle={handleMuteToggle}
  />

  <!-- Volume Range Slider (0 to 100 scaled down to 0.0 to 1.0) -->
  <div class="w-24 sm:w-28">
    <Slider
      type="single"
      value={volume * 100}
      min={0}
      max={100}
      step={1}
      {disabled}
      onValueChange={(val) => handleSliderChange(val / 100)}
      class="cursor-pointer py-2
			[&_[data-slot=slider-thumb]]:bg-background
         [&_[data-slot=slider-thumb]]:border-[2.5px]
         [&_[data-slot=slider-thumb]]:border-primary
         [&_[data-slot=slider-thumb]]:shadow-xs
		 [&_[data-slot=slider-thumb]]:w-2.5
         [&_[data-slot=slider-thumb]]:h-5
         [&_[data-slot=slider-thumb]]:rounded-sm
         hover:[&_[data-slot=slider-thumb]]:scale-110
         transition-transform"
    />
  </div>
</div>
