<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog";
  import * as Tabs from "$lib/components/ui/tabs";
  import LabelledSelect from "$lib/components/molecules/LabelledSelect.svelte";
  import { settings } from "$lib/stores/settings.svelte";
  import { SETTINGS_DEFINITIONS } from "$lib/config/settingsRegistry";
  import type { SettingCategory, SettingDefinition } from "$lib/types/settings";
  import { SlidersHorizontal, Palette, Disc3 } from "@lucide/svelte";

  interface Props {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
  }

  let { open = $bindable(false), onOpenChange }: Props = $props();

  const categories: SettingCategory[] = ["Appearance", "AutoDJ"];

  const categoryIcons = {
    Appearance: Palette,
    AutoDJ: Disc3,
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

  function handleWindowKeydown(e: KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === ",") {
      e.preventDefault();
      open = !open;
      onOpenChange?.(open);
    }
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<Dialog.Root bind:open {onOpenChange}>
  <Dialog.Content
    class="flex flex-col h-[85vh] w-[90vw] max-w-4xl p-0 gap-0 overflow-hidden border border-border/80 shadow-2xl bg-card text-card-foreground sm:max-w-4xl
           [&>button:last-child]:top-3 [&>button:last-child]:right-4 [&>button:last-child]:size-7 [&>button:last-child]:flex [&>button:last-child]:items-center [&>button:last-child]:justify-center [&>button:last-child]:rounded-md"
  >
    <div
      class="h-12 px-6 pr-14 border-b border-border/60 flex items-center justify-between bg-muted/20 shrink-0 select-none"
    >
      <div class="flex items-center gap-2.5">
        <SlidersHorizontal class="size-4 text-secondary-foreground" />
        <Dialog.Title
          class="text-sm text-secondary-foreground font-semibold tracking-tight"
          >Preferences</Dialog.Title
        >
      </div>
    </div>

    <!-- Tabs Container: fills all remaining vertical space -->
    <Tabs.Root
      defaultValue="Appearance"
      class="flex-1 min-h-0 flex flex-col w-full"
    >
      <!-- Tabs Strip (fixed height: shrink-0) -->
      <div class="px-6 pt-3 border-b border-border/40 bg-muted/10 shrink-0">
        <Tabs.List class="bg-transparent p-0 gap-4 h-10">
          {#each categories as category}
            {@const Icon = categoryIcons[category]}
            <Tabs.Trigger
              value={category}
              class="relative h-10 rounded-none border-b-2 border-transparent px-2 pb-2.5 pt-2 font-medium text-xs text-muted-foreground data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:bg-transparent shadow-none transition-none cursor-pointer flex items-center gap-1.5"
            >
              {#if Icon}
                <Icon class="size-3.5" />
              {/if}
              <span>{category}</span>
            </Tabs.Trigger>
          {/each}
        </Tabs.List>
      </div>

      <!-- Tab Viewport: scrolls internally while outer dialog dimensions remain completely static -->
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
  </Dialog.Content>
</Dialog.Root>
