<script lang="ts">
  import { requestPasswordReset } from '$lib/api';
  import { switchOverlay } from '$lib/ui.svelte';

  let email = $state('');
  let busy = $state(false);
  let error = $state('');
  let sent = $state(false);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      await requestPasswordReset(email.trim());
      sent = true;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Something went wrong — try again.';
    } finally {
      busy = false;
    }
  }
</script>

<h2>Reset your password</h2>

{#if sent}
  <p class="auth-notice success">
    If an account has <strong>{email.trim()}</strong> as its confirmed email, a link
    to choose a new password is on its way. It's valid for one hour.
  </p>
{:else}
  <p class="auth-lead">
    Enter the email address you added to your account. Accounts without a
    confirmed email address can't be recovered.
  </p>
  <form onsubmit={handleSubmit}>
    <div class="field">
      <label for="email">Email</label>
      <input id="email" type="email" bind:value={email} autocomplete="email" required />
    </div>
    {#if error}<p class="auth-error">{error}</p>{/if}
    <button type="submit" disabled={busy || !email.trim()}>{busy ? 'Sending…' : 'Send reset link'}</button>
  </form>
{/if}
<div class="auth-links">
  <button class="btn-link" onclick={() => switchOverlay('login')}>Back to log in</button>
</div>
