<!-- src/lib/components/atoms/ToggleButton.svelte -->
<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ButtonProps } from "$lib/components/ui/button";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";

  interface Props {
    /** The current binary or toggle state */
    active?: boolean;
    /** Icon to show when active is false */
    inactiveIcon?: Component<{ class?: string }>;
    /** Icon to show when active is true */
    activeIcon?: Component<{ class?: string }>;
    /** Accessible label describing the action when inactive (e.g. "Play") */
    inactiveLabel?: string;
    /** Accessible label describing the action when active (e.g. "Pause") */
    activeLabel?: string;
    /** Action to fire when clicking in inactive state */
    onActivate?: () => void;
    /** Action to fire when clicking in active state */
    onDeactivate?: () => void;
    /** Optional general toggle handler passing next boolean */
    onToggle?: (nextState: boolean) => void;
    /** Click handler if used as a trigger for dropdowns/popovers */
    onclick?: (event: MouseEvent) => void;
    /** shadcn-svelte Button variant when inactive */
    inactiveVariant?: ButtonProps["variant"];
    /** shadcn-svelte Button variant when active */
    activeVariant?: ButtonProps["variant"];
    /** Extra classes for the button when active */
    activeClass?: string;
    /** Extra classes for the button when inactive */
    inactiveClass?: string;
    /** Button size preset */
    size?: ButtonProps["size"];
    /** Extra classes for the icon */
    iconClass?: string;
    disabled?: boolean;
    children?: Snippet<[{ active: boolean }]>;
    [key: string]: any;
  }

  let {
    active = false,
    inactiveIcon: InactiveIcon,
    activeIcon: ActiveIcon,
    inactiveLabel = "Toggle on",
    activeLabel = "Toggle off",
    onActivate,
    onDeactivate,
    onToggle,
    onclick,
    inactiveVariant = "ghost",
    activeVariant = "ghost",
    size = "icon",
    activeClass = "",
    inactiveClass,
    iconClass = "size-5",
    disabled = false,
    children,
    ...restProps
  }: Props = $props();

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    onclick?.(event);
    if (active) {
      onDeactivate?.();
      onToggle?.(false);
    } else {
      onActivate?.();
      onToggle?.(true);
    }
  }

  let currentVariant = $derived(active ? activeVariant : inactiveVariant);
  let currentLabel = $derived(active ? activeLabel : inactiveLabel);
</script>

<Button
  variant={currentVariant}
  {size}
  aria-label={currentLabel}
  title={currentLabel}
  onclick={handleClick}
  {disabled}
  class={cn(
    "transition-all select-none hover:text-secondary-foreground",
    active ? activeClass : inactiveClass || activeClass
  )}
  {...restProps}
>
  {#if children}
    {@render children({ active })}
  {:else if active && ActiveIcon}
    <ActiveIcon class={cn(iconClass, "transition-transform")} />
  {:else if !active && InactiveIcon}
    <InactiveIcon class={cn(iconClass, "transition-transform")} />
  {/if}
</Button>
