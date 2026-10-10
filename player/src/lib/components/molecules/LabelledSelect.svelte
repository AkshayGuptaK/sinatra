<script lang="ts">
  import * as Select from "$lib/components/ui/select";
  import { Label } from "$lib/components/ui/label";

  export interface SelectOption {
    value: string;
    label: string;
    description?: string;
  }

  interface Props {
    id: string;
    label: string;
    description?: string;
    options: SelectOption[];
    value: string;
    placeholder?: string;
    disabled?: boolean;
    onValueChange?: (val: string) => void;
  }

  let {
    id,
    label,
    description,
    options,
    value = $bindable(),
    placeholder = "Select an option",
    disabled = false,
    onValueChange,
  }: Props = $props();

  let selectedLabel = $derived(
    options.find((opt) => opt.value === value)?.label ?? placeholder
  );

  function handleSelect(nextVal: string | undefined) {
    if (!nextVal) return;
    value = nextVal;
    onValueChange?.(nextVal);
  }
</script>

<div class="flex items-center justify-between gap-4 py-2.5">
  <div class="flex flex-col gap-0.5 max-w-[60%]">
    <Label for={id} class="text-sm font-medium leading-none cursor-pointer">
      {label}
    </Label>
    {#if description}
      <span class="text-xs text-muted-foreground">{description}</span>
    {/if}
  </div>

  <Select.Root type="single" {value} onValueChange={handleSelect} {disabled}>
    <Select.Trigger {id} class="w-48 text-xs h-9">
      {selectedLabel}
    </Select.Trigger>
    <Select.Content class="z-50 min-w-48">
      {#each options as opt}
        <Select.Item value={opt.value} label={opt.label} class="text-xs">
          <div class="flex flex-col">
            <span>{opt.label}</span>
            {#if opt.description}
              <span class="text-[10px] text-muted-foreground"
                >{opt.description}</span
              >
            {/if}
          </div>
        </Select.Item>
      {/each}
    </Select.Content>
  </Select.Root>
</div>
