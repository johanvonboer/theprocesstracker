<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { showAppWithOverlay, type Overlay } from '$lib/ui.svelte';

  // /about, /login, /register, /forgot-password: links (and the email pages)
  // keep working, and open the app with that overlay showing.
  onMount(() => showAppWithOverlay(page.params.overlay as Overlay));
</script>
