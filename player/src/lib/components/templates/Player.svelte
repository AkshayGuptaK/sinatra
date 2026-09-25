<script lang="ts">
  import NowPlaying from "$lib/components/organisms/NowPlaying.svelte";
  import ActiveQueue from "$lib/components/organisms/ActiveQueue.svelte";
  import Library from "$lib/components/organisms/Library.svelte";
</script>

<div class="flex h-full w-full">
  <div class="flex flex-1 flex-col min-w-0 h-full overflow-hidden">
    <div class="flex-1 min-h-0 w-full">
      <Library class="h-full w-full" />
    </div>

    <div class="w-full shrink-0">
      <NowPlaying class="w-full" />
    </div>
  </div>

  <aside class="w-80 lg:w-96 shrink-0 h-full flex flex-col">
    <ActiveQueue class="h-full w-full max-w-none" />
  </aside>
</div>
