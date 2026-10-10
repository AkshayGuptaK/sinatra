<script lang="ts">
  import type { Snippet } from "svelte";
  import { settings } from "$lib/stores/settings.svelte";

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  const theme = $derived(settings.get<string>("appearance.theme") ?? "dark");
  const skin = $derived(settings.get<string>("appearance.skin") ?? "default");

  $effect(() => {
    if (typeof document === "undefined") return;

    const isDark =
      theme === "dark" ||
      (theme === "system" &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);

    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.setAttribute("data-skin", skin);
  });
</script>

{@render children?.()}
