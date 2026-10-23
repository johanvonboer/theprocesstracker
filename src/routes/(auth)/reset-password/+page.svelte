<script lang="ts">
  import { page } from '$app/state';
  import { resetPassword } from '$lib/api';

  const MIN_PASSWORD = 8;
  const token = page.url.searchParams.get('token') ?? '';

  let password = $state('');
  let confirm = $state('');
  let busy = $state(false);
  let error = $state('');
  let done = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await resetPassword(token, password);
      done = true;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Something went wrong — try again.';
    } finally {
      busy = false;
    }
  }
</script>

<h1>Choose a new password</h1>

{#if !token}
  <p class="auth-error">This link is incomplete — open it straight from the email.</p>
{:else if done}
  <p class="auth-notice success">
    Your password has been changed, and every device has been logged out.
  </p>
  <div class="auth-links"><a href="/login">Log in with your new password</a></div>
{:else}
  <form onsubmit={handleSubmit}>
    <div class="field">
      <label for="password">New password</label>
      <input id="password" type="password" bind:value={password} autocomplete="new-password" required />
      {#if password && password.length < MIN_PASSWORD}
        <p class="auth-error">At least {MIN_PASSWORD} characters.</p>
      {/if}
    </div>
    <div class="field">
      <label for="confirm">Repeat password</label>
      <input id="confirm" type="password" bind:value={confirm} autocomplete="new-password" required />
      {#if confirm && confirm !== password}<p class="auth-error">The passwords don't match.</p>{/if}
    </div>
    {#if error}<p class="auth-error">{error}</p>{/if}
    <button type="submit" disabled={busy || password.length < MIN_PASSWORD || confirm !== password}>
      {busy ? 'Saving…' : 'Set new password'}
    </button>
  </form>
{/if}
