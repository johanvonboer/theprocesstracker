<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { ui } from '$lib/ui.svelte';

  // A shared-schema link (theprocesstracker.com/s/<code>): hand the code to the
  // app, which opens the import preview on the Exercises tab.
  onMount(() => {
    ui.pendingShareCode = page.params.code ?? null;
    goto('/', { replaceState: true });
  });
</script>
