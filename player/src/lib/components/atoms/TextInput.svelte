<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { Input } from "$lib/components/ui/input";
  import { cn } from "$lib/utils";

  interface Props extends Omit<HTMLInputAttributes, "type" | "files"> {
    ref?: HTMLInputElement | null;
    value?: string;
    variant?: "default" | "inline";
  }

  let {
    ref = $bindable(null),
    value = $bindable(""),
    variant = "default",
    autocomplete = "off",
    autocorrect = "off",
    autocapitalize = "off",
    spellcheck = "false",
    class: className = "",
    ...restProps
  }: Props = $props();
</script>

<Input
  bind:ref
  bind:value
  type="text"
  {autocomplete}
  {autocorrect}
  {autocapitalize}
  {spellcheck}
  class={cn(
    variant === "inline" && "h-auto py-0 px-1 border-none shadow-none rounded-none focus-visible:ring-0 focus-visible:border-none",
    className
  )}
  {...restProps}
/>
