<script lang="ts">
  interface Props {
    currentTitle: string;
    currentArtist: string;
  }

  let { currentTitle, currentArtist }: Props = $props();
</script>

<div
  class="flex flex-col min-w-0 w-full md:w-56 text-center md:text-left select-none"
>
  <span
    class="truncate text-base font-semibold tracking-tight text-foreground"
    title={currentTitle}
  >
    {currentTitle}
  </span>
  <span
    class="truncate text-xs font-medium text-muted-foreground"
    title={currentArtist}
  >
    {currentArtist}
  </span>
</div>
