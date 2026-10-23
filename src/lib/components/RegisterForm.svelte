<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { parseLegacyCredentials, isLegacyShape } from '$lib/api';
  import type { LegacyCredentials } from '$lib/types';
  import { showToast } from '$lib/toasts.svelte';
  import { closeOverlay, switchOverlay } from '$lib/ui.svelte';
  import QrScanOverlay from './QrScanOverlay.svelte';
  import { ScanLine, Check } from 'lucide-svelte';

  const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{2,31}$/;
  const MIN_PASSWORD = 8;

  let username = $state('');
  let password = $state('');
  let confirm = $state('');
  let email = $state('');
  let busy = $state(false);
  let error = $state('');

  // ── Moving from the old app ─────────────────────────────────────
  // This device's own old sync token is always carried over. Otherwise the
  // user can scan the old app's "Link another device" QR code.
  const deviceLegacy = store.legacyCredentials;
  let scannedLegacy = $state<LegacyCredentials | null>(null);
  let migrateOpen = $state(false);
  let showScanner = $state(false);
  let manualGuid = $state('');
  let manualSecret = $state('');
  const hasCamera = !!navigator.mediaDevices?.getUserMedia;

  function handleScan(raw: string) {
    showScanner = false;
    const creds = parseLegacyCredentials(raw);
    if (creds) scannedLegacy = creds;
    else showToast("That QR code isn't an old app's sync code");
  }

  function useManual() {
    const guid = manualGuid.trim().toLowerCase();
    const secret = manualSecret.trim().toLowerCase();
    if (isLegacyShape(guid, secret)) scannedLegacy = { guid, secret };
    else showToast("That GUID and secret don't look right — check them in the old app");
  }

  const normalizedUsername = $derived(username.trim().toLowerCase());
  const usernameProblem = $derived(
    normalizedUsername && !USERNAME_PATTERN.test(normalizedUsername)
      ? '3–32 characters: letters, numbers, and . _ - (starting with a letter or number).'
      : ''
  );
  const passwordProblem = $derived(
    password && password.length < MIN_PASSWORD ? `At least ${MIN_PASSWORD} characters.` : ''
  );
  const confirmProblem = $derived(confirm && confirm !== password ? "The passwords don't match." : '');
  const canSubmit = $derived(
    !!normalizedUsername && !usernameProblem && password.length >= MIN_PASSWORD && confirm === password
  );

  async function handleSubmit(e: SubmitEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    busy = true;
    error = '';
    try {
      const mail = email.trim() || null;
      await store.register(normalizedUsername, password, mail, deviceLegacy ?? scannedLegacy);
      showToast(
        mail ? `Account created — we've sent a link to ${mail} to confirm it.` : 'Account created — your workouts now sync.',
        { type: 'info' },
      );
      closeOverlay();
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Registration failed — try again.';
      busy = false;
    }
  }
</script>

<h2>Create an account</h2>
<p class="auth-lead">
  Free, and only used to sync your workouts between devices. Whatever is on this
  device now goes into the new account.
</p>

<form onsubmit={handleSubmit}>
  <div class="field">
    <label for="username">Username</label>
    <input id="username" type="text" bind:value={username} autocomplete="username"
      autocapitalize="off" spellcheck="false" required />
    {#if usernameProblem}<p class="auth-error">{usernameProblem}</p>{/if}
  </div>

  <div class="field">
    <label for="password">Password</label>
    <input id="password" type="password" bind:value={password} autocomplete="new-password" required />
    {#if passwordProblem}<p class="auth-error">{passwordProblem}</p>{/if}
  </div>

  <div class="field">
    <label for="confirm">Repeat password</label>
    <input id="confirm" type="password" bind:value={confirm} autocomplete="new-password" required />
    {#if confirmProblem}<p class="auth-error">{confirmProblem}</p>{/if}
  </div>

  <div class="field">
    <label for="email">Email <span class="optional">(optional)</span></label>
    <input id="email" type="email" bind:value={email} autocomplete="email" />
    <p class="field-hint">
      Only used to reset your password if you forget it — never for anything else.
      Without one, a forgotten password means the account can't be recovered.
    </p>
  </div>

  {#if deviceLegacy}
    <p class="auth-notice">
      This device already syncs with an anonymous account from an older version of
      the app. Your new account takes it over: everything it has synced comes along,
      and devices still running the old app keep syncing.
    </p>
  {:else if scannedLegacy}
    <p class="auth-notice success">
      <Check size={14} /> Old sync account found. Its data moves into your new account,
      and devices still running the old app keep syncing.
      <button type="button" class="btn-link" onclick={() => scannedLegacy = null}>Remove</button>
    </p>
  {:else}
    <div class="migrate">
      <button type="button" class="btn-link" onclick={() => migrateOpen = !migrateOpen}>
        Moving from the Android or desktop app?
      </button>
      {#if migrateOpen}
        <p class="field-hint">
          In the old app, open <strong>Settings → Remote sync → Link another device</strong>
          and scan the QR code it shows. Your synced data moves into the new account.
        </p>
        {#if hasCamera}
          <button type="button" class="btn-outline scan-btn" onclick={() => showScanner = true}>
            <ScanLine size={16} />Scan QR code
          </button>
        {/if}
        <p class="field-hint">Or copy the GUID and secret shown under Remote sync:</p>
        <input type="text" placeholder="GUID" bind:value={manualGuid} autocapitalize="off" spellcheck="false" />
        <input type="text" placeholder="Secret" bind:value={manualSecret} autocapitalize="off" spellcheck="false" />
        <button type="button" class="btn-outline" onclick={useManual}
          disabled={!manualGuid.trim() || !manualSecret.trim()}>Use these</button>
      {/if}
    </div>
  {/if}

  {#if error}<p class="auth-error">{error}</p>{/if}
  <button type="submit" disabled={busy || !canSubmit}>{busy ? 'Creating account…' : 'Create account'}</button>
</form>

<div class="auth-links">
  <button class="btn-link" onclick={() => switchOverlay('login')}>Already have an account? Log in</button>
</div>

{#if showScanner}
  <QrScanOverlay
    onscan={handleScan}
    onclose={() => showScanner = false}
    hint="Scan the QR code from the old app's “Link another device” screen."
  />
{/if}

<style>
  .migrate { display: flex; flex-direction: column; gap: 0.5rem; }
  .migrate input { width: 100%; }

  .scan-btn { display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }

  .migrate .btn-link { align-self: flex-start; }

  .auth-notice :global(svg) { vertical-align: -2px; }
</style>
