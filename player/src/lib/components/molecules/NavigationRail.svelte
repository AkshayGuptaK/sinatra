<script lang="ts">
  import {
    Compass,
    LayoutDashboard,
    AudioLines,
    Settings,
    type LucideProps,
  } from "@lucide/svelte";
  import { cn } from "$lib/utils";
  import type { Component } from "svelte";
  import SinatraIcon from "$lib/components/atoms/SinatraIcon.svelte";
  import { ui, type AppDeck } from "$lib/stores/ui.svelte";

  interface NavItem {
    id: AppDeck;
    label: string;
    title: string;
    icon: Component<LucideProps, {}, "">;
  }

  interface Props {
    class?: string;
  }

  let {
    class: className = "",
  }: Props = $props();

  const WORKSPACE_ITEMS: NavItem[] = [
    {
      id: "explore",
      label: "Explore",
      title: "Explore (Cmd+1)",
      icon: Compass,
    },
    {
      id: "curate",
      label: "Curate",
      title: "Curate (Cmd+2)",
      icon: LayoutDashboard,
    },
    {
      id: "vibe",
      label: "Vibe",
      title: "Vibe (Cmd+3)",
      icon: AudioLines,
    },
  ];

  const SYSTEM_ITEMS: NavItem[] = [
    {
      id: "settings",
      label: "Settings",
      title: "Settings (Cmd+,)",
      icon: Settings,
    },
  ];

  function handleClick(deck: AppDeck) {
    ui.setDeck(deck);
  }
</script>

<nav
  aria-label="Primary Navigation"
  class={cn(
    "flex flex-col items-center justify-between w-12 sm:w-14 h-full py-1 border-r border-border/60 bg-card/40 backdrop-blur-md select-none shrink-0 z-20",
    className
  )}
>
  <div class="flex flex-col items-center gap-4 w-full">
    <div
      class="flex items-center justify-center size-9 rounded-lg bg-primary/10 text-primary border border-primary/20 shadow-xs mb-1"
      title="Sinatra"
    >
      <SinatraIcon class="size-5" />
    </div>

    <div class="flex flex-col items-center gap-1.5 w-full px-2">
      {#each WORKSPACE_ITEMS as item (item.id)}
        {@const isActive = ui.activeDeck === item.id}
        <button
          type="button"
          onclick={() => handleClick(item.id)}
          aria-label={item.label}
          aria-current={isActive ? "page" : undefined}
          title={item.title}
          class={cn(
            "group relative flex items-center justify-center size-9 rounded-lg transition-all duration-150 cursor-pointer",
            isActive
              ? "bg-primary text-primary-foreground shadow-xs font-medium"
              : "text-muted-foreground hover:text-secondary-foreground hover:bg-muted/60"
          )}
        >
          {#if isActive}
            <span
              class="absolute -left-2 top-1.5 bottom-1.5 w-1 rounded-r-full bg-primary animate-in fade-in zoom-in-75 duration-150"
            ></span>
          {/if}

          <item.icon
            class="size-4.5 transition-transform group-hover:scale-105"
          />
        </button>
      {/each}
    </div>
  </div>

  <div class="flex flex-col items-center gap-1.5 w-full px-2">
    {#each SYSTEM_ITEMS as item (item.id)}
      {@const isActive = ui.activeDeck === item.id}
      <button
        type="button"
        onclick={() => handleClick(item.id)}
        aria-label={item.label}
        aria-current={isActive ? "page" : undefined}
        title={item.title}
        class={cn(
          "group relative flex items-center justify-center size-9 rounded-lg transition-all duration-150 cursor-pointer",
          isActive
            ? "bg-secondary text-secondary-foreground shadow-xs font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        )}
      >
        {#if isActive}
          <span
            class="absolute -left-2 top-1.5 bottom-1.5 w-1 rounded-r-full bg-secondary-foreground"
          ></span>
        {/if}

        <item.icon
          class="size-4.5 transition-transform group-hover:scale-105"
        />
      </button>
    {/each}
  </div>
</nav>

<style>
  :global(.animate-spin-slow) {
    animation: spin 16s linear infinite;
  }
  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
