<script lang="ts">
  import * as Tabs from "$lib/components/ui/tabs";
  import LabelledSelect from "$lib/components/molecules/LabelledSelect.svelte";
  import { settings } from "$lib/core/settings.svelte";
  import { SETTINGS_DEFINITIONS } from "$lib/config/settingsRegistry";
  import type { SettingCategory, SettingDefinition } from "$lib/types/settings";
  import {
    SlidersHorizontal,
    Palette,
    Disc3,
    Volume2,
    View,
  } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import HeaderBanner from "../molecules/HeaderBanner.svelte";

  interface Props {
    class?: string;
  }

  let { class: className = "" }: Props = $props();

  const categories: SettingCategory[] = [
    "Appearance",
    "Playback",
    "AutoDJ",
    "Visualizer",
  ];

  const categoryIcons = {
    Appearance: Palette,
    AutoDJ: Disc3,
    Playback: Volume2,
    Visualizer: View,
  };

  const booleanOptions = [
    { value: "true", label: "On" },
    { value: "false", label: "Off" },
  ];

  function getCategorySettings(cat: SettingCategory): SettingDefinition[] {
    return SETTINGS_DEFINITIONS.filter((def) => def.category === cat);
  }

  function getSettingCurrentValue(def: SettingDefinition): string {
    const val = settings.get(def.id);
    if (def.type === "boolean") {
      return val ? "true" : "false";
    }
    return String(val ?? def.defaultValue);
  }

  function handleSettingChange(def: SettingDefinition, nextVal: string) {
    if (def.type === "boolean") {
      settings.set(def.id, nextVal === "true");
    } else {
      settings.set(def.id, nextVal);
    }
  }
</script>

<div
  class={cn(
    "flex flex-col w-full h-full min-h-0 rounded-xl border bg-card text-card-foreground shadow-lg overflow-hidden select-none",
    className
  )}
>
  <!-- View Header Banner -->
  <HeaderBanner title="Preferences" icon={SlidersHorizontal} />

  <!-- Tabs Container -->
  <Tabs.Root
    defaultValue="Appearance"
    class="flex-1 min-h-0 flex flex-col w-full"
  >
    <!-- Tabs Bar Strip -->
    <div class="px-6 border-b border-border/40 bg-muted/10 shrink-0">
      <Tabs.List class="bg-transparent p-0 gap-4 h-10">
        {#each categories as category}
          {@const Icon = categoryIcons[category]}
          <Tabs.Trigger
            value={category}
            class="relative h-10 rounded-none border-b-2 border-transparent px-2 pb-2.5 pt-2 font-medium text-xs text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent hover:text-secondary-foreground shadow-none transition-none cursor-pointer flex items-center gap-1.5"
          >
            {#if Icon}
              <Icon class="size-3.5" />
            {/if}
            <span>{category}</span>
          </Tabs.Trigger>
        {/each}
      </Tabs.List>
    </div>

    <!-- Scrollable Tab Content Area -->
    <div class="flex-1 min-h-0 overflow-y-auto p-6">
      {#each categories as category}
        <Tabs.Content value={category} class="mt-0 space-y-4 outline-none">
          <div class="divide-y divide-border/40 max-w-2xl">
            {#each getCategorySettings(category) as def (def.id)}
              <div class="py-3 first:pt-0 last:pb-0">
                <LabelledSelect
                  id={def.id}
                  label={def.label}
                  description={def.description}
                  options={def.type === "boolean"
                    ? booleanOptions
                    : def.options}
                  value={getSettingCurrentValue(def)}
                  onValueChange={(val) => handleSettingChange(def, val)}
                />
              </div>
            {/each}
          </div>
        </Tabs.Content>
      {/each}
    </div>
  </Tabs.Root>
</div>
