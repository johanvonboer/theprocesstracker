<script lang="ts">
  import { onMount } from 'svelte';
  import { store } from '$lib/store.svelte';
  import * as api from '$lib/api';
  import type { Account } from '$lib/types';
  import { showToast } from '$lib/toasts.svelte';
  import { ui, closeOverlay, switchOverlay } from '$lib/ui.svelte';
  import QrScanOverlay from './QrScanOverlay.svelte';
  import { ScanLine } from 'lucide-svelte';

  // Logging in again after an expired session: the username is already known.
  let username = $state(store.account?.username ?? '');
  let password = $state('');
  let busy = $state(false);
  let error = $state('');
  // The password was accepted, but there is data on this device to decide about first.
  let pending = $state<Account | null>(null);

  const exerciseCount = $derived(store.exercises.filter(e => !e.deletedAt).length);
  const entryCount = $derived(store.entries.filter(e => !e.deletedAt).length);

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    await logIn(() => api.login(username.trim(), password), 'Login failed — try again.');
  }

  /** Both ways in — password or QR code — continue the same way once the server says yes. */
  async function logIn(authenticate: () => Promise<Account>, fallback: string) {
    busy = true;
    error = '';
    try {
      const account = await authenticate();
      if (store.localDataPlanFor(account) === 'ask') {
        pending = account;
        busy = false;
        return;
      }
      await finish(account, false);
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : fallback;
      busy = false;
    }
  }

  async function finish(account: Account, keepLocal: boolean) {
    busy = true;
    await store.completeLogin(account, keepLocal);
    showToast(`Logged in as ${account.username}`, { type: 'info' });
    closeOverlay();
  }

  // ── Logging in with a QR code from a logged-in device ───────────
  // Scanned here, or opened by the phone's camera app through /link.
  const hasCamera = !!navigator.mediaDevices?.getUserMedia;
  let showScanner = $state(false);
  let viaQr = $state(false);

  onMount(() => {
    const token = ui.pendingLoginLink;
    ui.pendingLoginLink = null;
    if (token) logInWithLink(token);
  });

  function handleScan(raw: string) {
    showScanner = false;
    const token = api.parseLoginLink(raw);
    if (token) logInWithLink(token);
    else if (api.parseLegacyCredentials(raw)) {
      error = "That's a sync code from the old app. To move it into an account, choose Create an account and scan it there.";
    } else {
      error = "That isn't a login QR code. On a device that's logged in, open Settings → Log in on another device.";
    }
  }

  function logInWithLink(token: string) {
    // Redeeming starts a session here, which would silently swap out the
    // account this device is logged in to.
    if (store.account && !store.sessionExpired) {
      error = `This device is already logged in as ${store.account.username}. To switch accounts, log out first.`;
      return;
    }
    viaQr = true;
    logIn(() => api.redeemLoginLink(token), "That QR code didn't work — show a new one on your other device.");
  }
</script>

{#if pending}
  {@const account = pending}
  <h2>Keep this device's workouts?</h2>
  <p class="auth-lead">
    This device has {exerciseCount} exercise{exerciseCount === 1 ? '' : 's'} and
    {entryCount} logged workout{entryCount === 1 ? '' : 's'} that aren't in your account.
  </p>
  {#if store.legacyCredentials}
    <p class="auth-notice">
      They belong to this device's old anonymous sync account. Adding them also
      brings over everything that account has synced, and devices still running the
      old app will start syncing into <strong>{account.username}</strong>.
    </p>
  {/if}
  <div class="choices">
    <button onclick={() => finish(account, true)} disabled={busy}>Add them to my account</button>
    <button class="btn-outline" onclick={() => finish(account, false)} disabled={busy}>
      Discard them and use my account's data
    </button>
  </div>
{:else}
  <h2>Log in</h2>
  <p class="auth-lead">Sync your workouts between all your devices.</p>

  {#if viaQr && busy}
    <p class="auth-notice">Logging in with the QR code…</p>
  {:else}
    <form onsubmit={handleSubmit}>
      <div class="field">
        <label for="username">Username</label>
        <input id="username" type="text" bind:value={username} autocomplete="username"
          autocapitalize="off" spellcheck="false" required />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" type="password" bind:value={password} autocomplete="current-password" required />
      </div>
      {#if error}<p class="auth-error">{error}</p>{/if}
      <button type="submit" disabled={busy || !username.trim() || !password}>
        {busy ? 'Logging in…' : 'Log in'}
      </button>
    </form>

    {#if hasCamera}
      <div class="or"><span>or</span></div>
      <button class="btn-outline scan-btn" onclick={() => { error = ''; showScanner = true; }} disabled={busy}>
        <ScanLine size={16} />Scan a QR code
      </button>
      <p class="field-hint scan-hint">
        Logged in on another device? Open <strong>Settings → Log in on another device</strong> there.
      </p>
    {/if}

    <div class="auth-links">
      <button class="btn-link" onclick={() => switchOverlay('register')}>Create an account</button>
      <button class="btn-link" onclick={() => switchOverlay('forgot-password')}>Forgot password?</button>
    </div>
  {/if}
{/if}

{#if showScanner}
  <QrScanOverlay
    onscan={handleScan}
    onclose={() => showScanner = false}
    hint="Scan the QR code shown under Settings → Log in on another device."
  />
{/if}

<style>
  .choices { display: flex; flex-direction: column; gap: 0.6rem; margin-top: 1.25rem; }

  .or {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0;
    font-size: 0.8rem;
    opacity: 0.5;
  }

  .or::before, .or::after { content: ''; flex: 1; border-top: 1px solid currentColor; opacity: 0.5; }

  .scan-btn {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.45rem;
    padding: 0.6rem 1rem;
  }

  .scan-hint { margin-top: 0.5rem; text-align: center; }
</style>
