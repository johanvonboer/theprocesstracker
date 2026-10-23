<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { parseLegacyCredentials, isLegacyShape, resendVerification } from '$lib/api';
  import type { LegacyCredentials } from '$lib/types';
  import { showToast } from '$lib/toasts.svelte';
  import { openOverlay } from '$lib/ui.svelte';
  import QrScanOverlay from './QrScanOverlay.svelte';
  import { ScanLine, QrCode } from 'lucide-svelte';

  const MIN_PASSWORD = 8;
  const hasCamera = !!navigator.mediaDevices?.getUserMedia;

  /** Which inline form is open — only one at a time. */
  let open = $state<'email' | 'password' | 'import' | 'delete' | 'disconnect' | null>(null);
  let busy = $state(false);

  function toggle(form: typeof open) {
    open = open === form ? null : form;
    currentPassword = '';
    newPassword = '';
    confirmPassword = '';
  }

  function fail(e: unknown, fallback: string) {
    showToast(e instanceof Error ? e.message : fallback);
  }

  // Shared form fields
  let currentPassword = $state('');
  let newPassword = $state('');
  let confirmPassword = $state('');
  let emailInput = $state('');

  // ── Email ───────────────────────────────────────────────────────
  function openEmailForm() {
    emailInput = store.account?.email ?? '';
    toggle('email');
  }

  async function saveEmail(remove = false) {
    busy = true;
    try {
      const email = remove ? null : emailInput.trim() || null;
      await store.setEmail(email, currentPassword);
      open = null;
      showToast(email ? `We've sent a link to ${email} to confirm it.` : 'Recovery email removed.', { type: 'info' });
    } catch (e) {
      fail(e, "Couldn't update your email.");
    } finally {
      busy = false;
    }
  }

  // Sending the email can take a few seconds; show it's under way.
  let resending = $state(false);

  async function handleResend() {
    resending = true;
    try {
      await resendVerification();
      showToast(`Confirmation link sent to ${store.account?.email}.`, { type: 'info' });
    } catch (e) {
      fail(e, "Couldn't send the link.");
    } finally {
      resending = false;
    }
  }

  // ── Password ────────────────────────────────────────────────────
  async function savePassword() {
    busy = true;
    try {
      await store.changePassword(currentPassword, newPassword);
      open = null;
      showToast('Password changed. Other devices have been logged out.', { type: 'info' });
    } catch (e) {
      fail(e, "Couldn't change your password.");
    } finally {
      busy = false;
    }
  }

  // ── Import an old GUID account ──────────────────────────────────
  let showScanner = $state(false);
  let manualGuid = $state('');
  let manualSecret = $state('');

  async function importLegacy(creds: LegacyCredentials) {
    busy = true;
    try {
      await store.importLegacyAccount(creds);
      open = null;
      manualGuid = '';
      manualSecret = '';
      showToast('Old sync account merged into your account.', { type: 'info' });
    } catch (e) {
      fail(e, "Couldn't merge that account.");
    } finally {
      busy = false;
    }
  }

  function handleScan(raw: string) {
    showScanner = false;
    const creds = parseLegacyCredentials(raw);
    if (creds) importLegacy(creds);
    else showToast("That QR code isn't an old app's sync code");
  }

  function importManual() {
    const guid = manualGuid.trim().toLowerCase();
    const secret = manualSecret.trim().toLowerCase();
    if (isLegacyShape(guid, secret)) importLegacy({ guid, secret });
    else showToast("That GUID and secret don't look right — check them in the old app");
  }

  // ── Delete ──────────────────────────────────────────────────────
  async function handleDelete() {
    busy = true;
    try {
      await store.deleteAccount(currentPassword);
      open = null;
      showToast('Account deleted. Your workouts are still on this device.', { type: 'info' });
    } catch (e) {
      fail(e, "Couldn't delete the account.");
    } finally {
      busy = false;
    }
  }
</script>

<h2>Account</h2>

{#if store.account && store.sessionExpired}
  <p class="hint">
    Your login as <strong>{store.account.username}</strong> has expired. Log in again
    to resume syncing — the workouts on this device are kept until you do.
  </p>
  <div class="actions">
    <button onclick={() => openOverlay('login')}>Log in again</button>
  </div>

{:else if store.account}
  {@const account = store.account}
  <div class="account-card">
    <span class="dot"></span>
    <div class="account-info">
      <span class="account-name">{account.username}</span>
      {#if account.email}
        <span class="account-meta">
          {account.email} ·
          {#if account.emailVerified}
            confirmed
          {:else}
            <span class="warn">not confirmed</span>
            <button class="btn-link" onclick={handleResend} disabled={resending}>{resending ? 'Sending…' : 'Resend link'}</button>
          {/if}
        </span>
      {:else}
        <span class="account-meta warn">No recovery email — a forgotten password can't be reset.</span>
      {/if}
    </div>
  </div>

  <div class="actions">
    <button class="btn-outline" onclick={openEmailForm}>{account.email ? 'Change email' : 'Add recovery email'}</button>
    <button class="btn-outline" onclick={() => toggle('password')}>Change password</button>
    <button class="btn-outline with-icon" onclick={() => openOverlay('link-device')}><QrCode size={15} />Log in on another device</button>
    <button class="btn-outline" onclick={() => toggle('import')}>Import from old app</button>
    <button class="btn-outline btn-danger" onclick={() => toggle('delete')}>Delete account</button>
  </div>

  {#if open === 'email'}
    <form class="inline-form" onsubmit={(e) => { e.preventDefault(); saveEmail(); }}>
      <p class="hint">Only used to reset your password if you forget it. We'll send a link to confirm it.</p>
      <input type="email" placeholder="you@example.com" bind:value={emailInput} autocomplete="email" />
      <input type="password" placeholder="Current password" bind:value={currentPassword} autocomplete="current-password" />
      <div class="actions">
        <button type="submit" disabled={busy || !emailInput.trim() || !currentPassword}>Save</button>
        {#if account.email}
          <button type="button" class="btn-outline" onclick={() => saveEmail(true)} disabled={busy || !currentPassword}>Remove email</button>
        {/if}
      </div>
    </form>
  {:else if open === 'password'}
    <form class="inline-form" onsubmit={(e) => { e.preventDefault(); savePassword(); }}>
      <input type="password" placeholder="Current password" bind:value={currentPassword} autocomplete="current-password" />
      <input type="password" placeholder="New password (at least {MIN_PASSWORD} characters)" bind:value={newPassword} autocomplete="new-password" />
      <input type="password" placeholder="Repeat new password" bind:value={confirmPassword} autocomplete="new-password" />
      {#if confirmPassword && confirmPassword !== newPassword}<p class="error">The passwords don't match.</p>{/if}
      <div class="actions">
        <button type="submit" disabled={busy || !currentPassword || newPassword.length < MIN_PASSWORD || newPassword !== confirmPassword}>
          Change password
        </button>
      </div>
    </form>
  {:else if open === 'import'}
    <div class="inline-form">
      <p class="hint">
        Bring over the data from an anonymous sync account used by the old Android or
        desktop app. In the old app, open <strong>Settings → Remote sync → Link another device</strong>
        and scan its QR code. Devices still running the old app then sync into this account.
      </p>
      {#if hasCamera}
        <div class="actions">
          <button class="scan-btn" onclick={() => showScanner = true} disabled={busy}><ScanLine size={16} />Scan QR code</button>
        </div>
      {/if}
      <p class="hint">Or copy the GUID and secret shown under Remote sync:</p>
      <input type="text" placeholder="GUID" bind:value={manualGuid} autocapitalize="off" spellcheck="false" />
      <input type="text" placeholder="Secret" bind:value={manualSecret} autocapitalize="off" spellcheck="false" />
      <div class="actions">
        <button class="btn-outline" onclick={importManual} disabled={busy || !manualGuid.trim() || !manualSecret.trim()}>Import</button>
      </div>
    </div>
  {:else if open === 'delete'}
    <form class="inline-form" onsubmit={(e) => { e.preventDefault(); handleDelete(); }}>
      <p class="hint">
        Permanently deletes your account and everything synced to it. The workouts on
        this device stay here, without an account.
      </p>
      <input type="password" placeholder="Password" bind:value={currentPassword} autocomplete="current-password" />
      <div class="actions">
        <button type="submit" class="btn-outline btn-danger" disabled={busy || !currentPassword}>Delete my account</button>
      </div>
    </form>
  {/if}

{:else if store.legacyCredentials}
  <p class="hint">
    This device syncs with an anonymous account from an older version of the app.
    Give it a username and password to keep it — all synced data stays, and devices
    still running the old app keep syncing.
  </p>
  <div class="actions">
    <button onclick={() => openOverlay('register')}>Create username &amp; password</button>
    <button class="btn-outline" onclick={() => openOverlay('login')}>Log in to an existing account</button>
    <button class="btn-outline" onclick={() => toggle('disconnect')}>Stop syncing</button>
  </div>
  {#if open === 'disconnect'}
    <div class="inline-form">
      <p class="hint">This device stops syncing but keeps its data. The account itself isn't deleted.</p>
      <div class="actions">
        <button class="btn-outline btn-danger" onclick={() => { store.disconnectLegacy(); open = null; }}>Stop syncing on this device</button>
      </div>
    </div>
  {/if}

{:else}
  <p class="hint">
    Optional. An account syncs your workouts between your devices — without one,
    everything is saved on this device only.
  </p>
  <div class="actions">
    <button onclick={() => openOverlay('login')}>Log in</button>
    <button class="btn-outline" onclick={() => openOverlay('register')}>Create account</button>
  </div>
{/if}

{#if showScanner}
  <QrScanOverlay
    onscan={handleScan}
    onclose={() => showScanner = false}
    hint="Scan the QR code from the old app's “Link another device” screen."
  />
{/if}

<style>
  h2 { margin: 0 0 0.35rem; font-size: 1.05rem; }

  .hint { font-size: 0.85rem; opacity: 0.6; margin: 0 0 0.9rem; }

  .actions { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
  .actions button { font-size: 0.875rem; }

  .account-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
  }

  .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; flex-shrink: 0; }

  .account-info { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
  .account-name { font-weight: 600; }
  .account-meta { font-size: 0.8rem; opacity: 0.7; overflow-wrap: anywhere; }
  .warn { color: var(--color-accent1); opacity: 1; }

  .inline-form {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-top: 1rem;
    padding: 1rem;
    border-radius: 10px;
    background: rgba(128, 128, 128, 0.08);
  }

  .inline-form .hint { margin: 0; }
  .inline-form input { width: 100%; }

  .error { margin: 0; font-size: 0.85rem; color: #ef4444; }

  .scan-btn, .with-icon { display: inline-flex; align-items: center; gap: 0.4rem; }

  .btn-link {
    background: none;
    border: none;
    padding: 0;
    font-size: inherit;
    color: var(--accent);
    cursor: pointer;
  }

  .btn-link:hover { background: none; text-decoration: underline; }
</style>
