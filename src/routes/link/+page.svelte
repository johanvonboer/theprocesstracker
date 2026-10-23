<script lang="ts">
  import { onMount } from 'svelte';
  import { ui, showAppWithOverlay } from '$lib/ui.svelte';

  // A login QR code opened by a phone camera (theprocesstracker.com/link#<code>):
  // hand the code to the login form. Leaving this page replaces its history
  // entry, so the code doesn't linger in the back stack.
  onMount(() => {
    ui.pendingLoginLink = location.hash.slice(1) || null;
    showAppWithOverlay('login');
  });
</script>
