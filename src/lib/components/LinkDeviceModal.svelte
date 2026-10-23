<script lang="ts">
  import { onMount } from 'svelte';
  import QRCode from 'qrcode';
  import { store } from '$lib/store.svelte';
  import { createLoginLink, loginLinkUrl } from '$lib/api';
  import { closeOverlay } from '$lib/ui.svelte';
  import Modal from './Modal.svelte';
  import { RefreshCw } from 'lucide-svelte';

  // Shows a single-use QR code that logs another device into this account.
  // Codes are short-lived, so this counts down and offers a fresh one.
  let qr = $state<string | null>(null);
  let expiresAt = $state(0);
  let now = $state(Date.now());
  let busy = $state(false);
  let error = $state('');

  const loggedIn = $derived(!!store.account && !store.sessionExpired);
  const secondsLeft = $derived(Math.max(0, Math.ceil((expiresAt - now) / 1000)));
  const expired = $derived(!!qr && secondsLeft === 0);

  async function newCode() {
    busy = true;
    error = '';
    try {
      const { token, expiresIn } = await createLoginLink();
      qr = await QRCode.toDataURL(loginLinkUrl(token), {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      expiresAt = Date.now() + expiresIn * 1000;
      now = Date.now();
    } catch (e: unknown) {
      qr = null;
      error = e instanceof Error ? e.message : "Couldn't make a QR code — try again.";
    } finally {
      busy = false;
    }
  }

  onMount(() => {
    if (loggedIn) newCode();
    const tick = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(tick);
  });

  const countdown = $derived(`${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}`);
</script>

<Modal label="Log in on another device" onclose={closeOverlay}>
  <div class="auth-card">
    <h2>Log in on another device</h2>

    {#if !loggedIn}
      <p class="auth-lead">Log in on this device first — then it can show a QR code for your others.</p>
    {:else}
      <p class="auth-lead">
        Scan this with the other device's camera, or tap <strong>Log in → Scan a QR code</strong>
        in The Process there.
      </p>

      <div class="qr-frame" class:expired>
        {#if qr}
          <img src={qr} alt="QR code that logs another device into {store.account?.username}" />
        {:else if busy}
          <span class="qr-placeholder">Making a code…</span>
        {/if}
        {#if expired}
          <button class="qr-refresh" onclick={newCode} disabled={busy}><RefreshCw size={16} />Show a new code</button>
        {/if}
      </div>

      {#if error}
        <p class="auth-error">{error}</p>
        <button class="btn-outline" onclick={newCode} disabled={busy}>Try again</button>
      {:else if qr && !expired}
        <p class="countdown">Works once, for the next <strong>{countdown}</strong></p>
      {/if}

      <p class="auth-notice">
        Whoever scans this code is logged in as <strong>{store.account?.username}</strong> —
        only show it to your own devices.
      </p>
    {/if}
  </div>
</Modal>

<style>
  .qr-frame {
    position: relative;
    width: min(260px, 100%);
    aspect-ratio: 1;
    margin: 0 auto 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 12px;
    background: #ffffff;
    overflow: hidden;
  }

  .qr-frame img { display: block; width: 100%; height: 100%; transition: opacity 0.2s, filter 0.2s; }
  .qr-frame.expired img { opacity: 0.12; filter: blur(3px); }

  .qr-placeholder { font-size: 0.85rem; color: #555; }

  .qr-refresh {
    position: absolute;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .countdown { margin: 0 0 1rem; text-align: center; font-size: 0.85rem; opacity: 0.7; font-variant-numeric: tabular-nums; }

  .auth-error + .btn-outline { display: block; margin: 0.5rem auto 1rem; }
</style>
