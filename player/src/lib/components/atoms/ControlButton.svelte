<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { ButtonProps } from "$lib/components/ui/button";
  import { Button } from "$lib/components/ui/button";
  import { cn } from "$lib/utils";

  interface Props {
    /** Icon to show */
    icon: Component<{ class?: string }>;
    /** Action to fire when clicking */
    onClick: () => void;
    /** Accessible label describing the action */
    label?: string;
    /** Accessible title describing the action */
    title?: string;
    /** Button size preset */
    size?: ButtonProps["size"];
    /** Extra classes for the button */
    class?: string;
    /** Extra classes for the icon */
    iconClass?: string;
    disabled?: boolean;
    children?: Snippet;
  }

  let {
    icon: Icon,
    onClick,
    label = "",
    title = "",
    size = "icon",
    class: className = "size-9",
    iconClass = "size-5",
    disabled = false,
    children,
    ...restProps
  }: Props = $props();

  function handleClick(event: MouseEvent) {
    event.stopPropagation();
    onClick();
  }
</script>

<Button
  variant="ghost"
  {size}
  aria-label={label}
  {title}
  onclick={handleClick}
  {disabled}
  class={cn(
    "text-muted-foreground hover:text-secondary-foreground transition-colors",
    className
  )}
  {...restProps}
>
  <Icon class={iconClass} />
  {#if children}
    {@render children()}
  {/if}
</Button>
