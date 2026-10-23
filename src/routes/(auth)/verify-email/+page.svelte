<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { store } from '$lib/store.svelte';
  import { verifyEmail } from '$lib/api';

  const token = page.url.searchParams.get('token') ?? '';
  let status = $state<'working' | 'done' | 'error'>(token ? 'working' : 'error');
  let error = $state(token ? '' : 'This link is incomplete — open it straight from the email.');

  onMount(async () => {
    if (!token) return;
    try {
      await verifyEmail(token);
      status = 'done';
      if (store.account) store.refreshAccount();
    } catch (e: unknown) {
      status = 'error';
      error = e instanceof Error ? e.message : 'Something went wrong — try again.';
    }
  });
</script>

<h1>Confirm your email</h1>

{#if status === 'working'}
  <p class="auth-lead">Confirming…</p>
{:else if status === 'done'}
  <p class="auth-notice success">
    Your email address is confirmed. If you ever forget your password, you can
    reset it from the log in page.
  </p>
{:else}
  <p class="auth-error">{error}</p>
{/if}
