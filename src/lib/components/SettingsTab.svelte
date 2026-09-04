<script lang="ts">
  import { store } from '$lib/store.svelte';
  import QRCode from 'qrcode';
  import QrScanner from 'qr-scanner';
  import { urgencyColorFromDays } from '$lib/utils';
  import { showToast } from '$lib/toasts.svelte';

  // ── Theme & color settings ────────────────────────────────────
  // (reads/writes store.settings directly via store.updateSettings)

  // ── Sync account management ───────────────────────────────────
  let syncServerUrl = $state('https://api.theprocesstracker.com');
  let showQr = $state(false);
  let qrDataUrl = $state<string | null>(null);
  let linkGuid = $state('');
  let linkSecret = $state('');
  let syncBusy = $state(false);
  let unlinkPending = $state(false);
  let deletePending = $state(false);
  let deleteBusy = $state(false);
  let showSecret = $state(false);
  let showManualInput = $state(false);

  const isAndroid = navigator.userAgent.includes('Android');
  // Capability check only. Don't call QrScanner.hasCamera() here — it runs
  // enumerateDevices(), which WebKit gates behind the camera permission prompt,
  // so probing on mount asks for the camera just for opening this tab. The real
  // permission request belongs in scanAndLink()/qrScanner.start().
  const hasCamera = isAndroid || !!navigator.mediaDevices?.getUserMedia;

  // Webcam scanner state
  let showScanOverlay = $state(false);
  let scanVideoEl = $state<HTMLVideoElement | null>(null);
  let qrScanner: QrScanner | null = null;

  $effect(() => {
    if (!showScanOverlay || !scanVideoEl || isAndroid) return;
    qrScanner = new QrScanner(
      scanVideoEl,
      (result) => handleScannedContent(result.data),
      { returnDetailedScanResult: true, highlightScanRegion: true },
    );
    qrScanner.start().catch(() => {
      showToast('Could not access camera');
      closeScanOverlay();
    });
    return () => { qrScanner?.destroy(); qrScanner = null; };
  });

  function closeScanOverlay() { showScanOverlay = false; }

  async function handleScannedContent(raw: string) {
    qrScanner?.stop();
    closeScanOverlay();
    syncBusy = true;
    try {
      const url = new URL(raw.replace(/^intent:\/\//, 'https://'));
      const guid = url.searchParams.get('guid');
      const secret = url.searchParams.get('secret');
      const server = url.searchParams.get('server');
      if (!guid || !secret || !server) {
        showToast('Invalid QR code — could not find account credentials');
        return;
      }
      await store.linkAccount(server, guid, secret);
      showToast('Account linked successfully', { type: 'info' });
    } catch {
      showToast('Invalid QR code — could not find account credentials');
    } finally {
      syncBusy = false;
    }
  }

  async function scanAndLink() {
    if (isAndroid) {
      syncBusy = true;
      try {
        const { scan, checkPermissions, requestPermissions, Format } = await import('@tauri-apps/plugin-barcode-scanner');
        let permission = await checkPermissions();
        if (permission !== 'granted') {
          permission = await requestPermissions();
        }
        if (permission !== 'granted') {
          showToast('Camera permission is required to scan QR codes');
          return;
        }
        const result = await scan({ windowed: false, formats: [Format.QRCode] });
        await handleScannedContent(result.content);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
        console.error('Scan error:', e);
        if (msg !== 'scan cancelled') {
          showToast(msg || 'Failed to scan QR code');
        }
      } finally {
        syncBusy = false;
      }
    } else {
      showScanOverlay = true;
    }
  }

  async function openQr() {
    const { guid, secret, serverUrl } = store.syncConfig!;
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.theprocesstracker.app';
    const intentUrl =
      `intent://link?guid=${encodeURIComponent(guid)}` +
      `&secret=${encodeURIComponent(secret)}` +
      `&server=${encodeURIComponent(serverUrl)}` +
      `#Intent;scheme=theprocesstracker;package=com.theprocesstracker.app` +
      `;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;
    qrDataUrl = await QRCode.toDataURL(intentUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    showQr = true;
  }

  function closeQr() { showQr = false; qrDataUrl = null; }

  async function handleCreateAccount() {
    syncBusy = true;
    try {
      await store.createAccount(syncServerUrl);
      showToast('Account created and sync activated', { type: 'info' });
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : String(e) || 'Failed to create account');
    } finally {
      syncBusy = false;
    }
  }

  async function handleLinkAccount() {
    syncBusy = true;
    try {
      await store.linkAccount(syncServerUrl, linkGuid.trim(), linkSecret.trim());
      showToast('Account linked successfully', { type: 'info' });
      linkGuid = '';
      linkSecret = '';
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to link account');
    } finally {
      syncBusy = false;
    }
  }

  async function confirmDelete() {
    deleteBusy = true;
    try {
      await store.deleteAccount();
      deletePending = false;
      closeQr();
      showToast('Account deleted', { type: 'info' });
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to delete account');
    } finally {
      deleteBusy = false;
    }
  }

</script>

<section class="settings">
  <h2>Appearance</h2>
  <p class="settings-hint">Choose how the app looks.</p>

  <div class="setting-row">
    <span class="setting-label">Theme</span>
    <div class="theme-toggle">
      {#each (['system', 'light', 'dark'] as const) as option}
        <button
          class="theme-btn"
          class:active={store.settings.theme === option}
          onclick={() => store.updateSettings({ theme: option })}
        >{option.charAt(0).toUpperCase() + option.slice(1)}</button>
      {/each}
    </div>
  </div>

  <h2 style="margin-top: 1.75rem;">Workout queue colors</h2>
  <p class="settings-hint">
    Controls how quickly the left-hand color strip transitions from green through yellow to red.
  </p>

  <div class="setting-row">
    <label for="yellow-days">Turn yellow after</label>
    <div class="slider-row">
      <input
        id="yellow-days"
        type="range" min="1" max="6"
        value={store.settings.yellowAfterDays}
        oninput={(e) => {
          const val = Number((e.target as HTMLInputElement).value);
          const red = store.settings.redAfterDays;
          store.updateSettings({ yellowAfterDays: Math.min(val, red - 1) });
        }}
      />
      <span class="slider-value">{store.settings.yellowAfterDays} {store.settings.yellowAfterDays === 1 ? 'day' : 'days'}</span>
    </div>
  </div>

  <div class="setting-row">
    <label for="red-days">Turn red after</label>
    <div class="slider-row">
      <input
        id="red-days"
        type="range" min="2" max="7"
        value={store.settings.redAfterDays}
        oninput={(e) => {
          const val = Number((e.target as HTMLInputElement).value);
          const yellow = store.settings.yellowAfterDays;
          store.updateSettings({ redAfterDays: Math.max(val, yellow + 1) });
        }}
      />
      <span class="slider-value">{store.settings.redAfterDays} {store.settings.redAfterDays === 1 ? 'day' : 'days'}</span>
    </div>
  </div>

  <div class="color-preview">
    {#each Array.from({ length: store.settings.redAfterDays + 1 }, (_, i) => i) as day}
      <div class="preview-swatch" style="background: {urgencyColorFromDays(day, store.settings.yellowAfterDays, store.settings.redAfterDays)}">
        <span>{day === 0 ? 'Today' : day === 1 ? '1 day' : `${day} days`}</span>
      </div>
    {/each}
  </div>

  <div class="section-heading" style="margin-top: 1.75rem;">
    <h2>Remote sync</h2>
    <span class="tooltip-wrap">
      <span class="tooltip-icon">?</span>
      <span class="tooltip-box">
        Remote sync is completely optional — the app works just as well in standalone mode. But this will allow you to sync your data between devices.
        If you choose to create an account, it's free, anonymous, and literally a single click.
      </span>
    </span>
  </div>
  <p class="settings-hint">Sync your data across devices.</p>

  {#if store.syncConfig}
    <div class="sync-connected">
      <span class="sync-dot"></span>
      <div class="sync-info">
        <span class="sync-server">{store.syncConfig.serverUrl}</span>
        <span class="sync-guid">GUID: {store.syncConfig.guid}</span>
        <span class="sync-secret-row">
          <span class="sync-secret-value">
            {showSecret ? store.syncConfig.secret : '••••••••••••••••'}
          </span>
          <button class="btn-reveal" onclick={() => (showSecret = !showSecret)}>
            {showSecret ? 'Hide secret' : 'Reveal secret'}
          </button>
        </span>
      </div>
    </div>
    <div class="sync-actions">
      <button class="btn-outline" onclick={openQr}>Link another device</button>
      {#if unlinkPending}
        <div class="sync-unlink-confirm">
          <span>Unlink?</span>
          <button class="btn-icon btn-danger" onclick={() => { store.unlinkAccount(); unlinkPending = false; closeQr(); }} title="Confirm">✓</button>
          <button class="btn-icon btn-ghost" onclick={() => (unlinkPending = false)} title="Cancel">✗</button>
        </div>
      {:else}
        <button class="btn-outline" onclick={() => { unlinkPending = true; deletePending = false; }}>Unlink account</button>
      {/if}
      {#if deletePending}
        <div class="sync-unlink-confirm">
          <span class="delete-confirm-label">Delete server account?</span>
          <span class="delete-confirm-note">Your local data won't be affected.</span>
          <button class="btn-icon btn-danger" onclick={confirmDelete} disabled={deleteBusy} title="Confirm">✓</button>
          <button class="btn-icon btn-ghost" onclick={() => (deletePending = false)} disabled={deleteBusy} title="Cancel">✗</button>
        </div>
      {:else}
        <button class="btn-outline" onclick={() => { deletePending = true; unlinkPending = false; }}>Delete account</button>
      {/if}
    </div>

  {:else}
    <button onclick={handleCreateAccount} disabled={syncBusy || !syncServerUrl.trim()}>
      {syncBusy ? 'Creating…' : 'Activate remote sync with new account'}
    </button>

    <div class="sync-divider">or link an existing account</div>

    {#if hasCamera}
      <button onclick={scanAndLink} disabled={syncBusy}>Scan QR code</button>
    {/if}

    <button class="btn-outline" onclick={() => (showManualInput = !showManualInput)}>
      Advanced
    </button>

    {#if showManualInput}
      <div class="manual-input-expanded">
        <div class="setting-row">
          <label for="link-guid">GUID</label>
          <input id="link-guid" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" bind:value={linkGuid} />
        </div>
        <div class="setting-row">
          <label for="link-secret">Secret</label>
          <input id="link-secret" type="text" placeholder="64-character secret key" bind:value={linkSecret} />
        </div>
        <div class="setting-row">
          <label for="sync-server-url">Server URL</label>
          <input id="sync-server-url" type="text" bind:value={syncServerUrl} />
        </div>
        <button
          onclick={handleLinkAccount}
          disabled={syncBusy || !syncServerUrl.trim() || !linkGuid.trim() || !linkSecret.trim()}
        >
          {syncBusy ? 'Linking…' : 'Link account'}
        </button>
      </div>
    {/if}
  {/if}
</section>

{#if showScanOverlay}
  <div class="qr-overlay">
    <button class="qr-back" onclick={closeScanOverlay}>← Back</button>
    <div class="qr-content">
      <video bind:this={scanVideoEl} class="scan-video"></video>
    </div>
  </div>
{/if}

{#if showQr && qrDataUrl}
  <div class="qr-overlay">
    <button class="qr-back" onclick={closeQr}>← Back</button>
    <div class="qr-content">
      <img src={qrDataUrl} alt="Account linking QR code" class="qr-image" />
      <p class="qr-hint">Scan with your Android phone. Opens the app if installed, or takes you to the Play Store.</p>
      <p class="qr-warning">Keep this QR code private — it contains your account credentials.</p>
    </div>
  </div>
{/if}

<style>
  .settings h2 { margin: 0 0 0.35rem; font-size: 1.05rem; }

  .setting-label { font-size: 0.9rem; font-weight: 500; }

  .theme-toggle {
    display: flex;
    gap: 0.25rem;
    margin-top: 0.4rem;
  }

  .theme-btn {
    flex: 1;
    background: rgba(128,128,128,0.1);
    color: inherit;
    border: 1px solid rgba(128,128,128,0.2);
    border-radius: 8px;
    padding: 0.4rem 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .theme-btn:hover { background: rgba(128,128,128,0.18); }
  .theme-btn.active { background: var(--interactive); color: var(--interactive-text); border-color: var(--interactive); }

  .settings-hint {
    font-size: 0.85rem;
    opacity: 0.55;
    margin: 0 0 1.5rem;
  }

  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    margin-bottom: 1.25rem;
  }

  .setting-row label { font-size: 0.9rem; font-weight: 500; }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .slider-row input[type='range'] {
    flex: 1;
    border: none;
    padding: 0;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .slider-value {
    font-size: 0.875rem;
    font-weight: 600;
    min-width: 4rem;
  }

  .color-preview {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
    margin-top: 1.5rem;
  }

  .preview-swatch {
    border-radius: 8px;
    padding: 0.4rem 0.6rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.3);
    white-space: nowrap;
  }

  .section-heading {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .section-heading h2 { margin: 0; }

  .tooltip-wrap {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .tooltip-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.1rem;
    height: 1.1rem;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    font-size: 0.65rem;
    font-weight: 700;
    opacity: 0.4;
    cursor: default;
    user-select: none;
    transition: opacity 0.15s;
  }

  .tooltip-wrap:hover .tooltip-icon { opacity: 0.75; }

  .tooltip-box {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    bottom: calc(100% + 0.4rem);
    left: 50%;
    transform: translateX(-50%);
    background: #1f2937;
    color: #f9fafb;
    font-size: 0.8rem;
    line-height: 1.45;
    padding: 0.55rem 0.75rem;
    border-radius: 8px;
    width: 220px;
    box-shadow: 0 4px 14px rgba(0,0,0,0.3);
    pointer-events: none;
    transition: opacity 0.15s;
    z-index: 10;
  }

  .tooltip-wrap:hover .tooltip-box { visibility: visible; opacity: 1; }

  .sync-connected {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: rgba(34, 197, 94, 0.08);
    border: 1px solid rgba(34, 197, 94, 0.25);
    border-radius: 10px;
    padding: 0.75rem 1rem;
    margin-bottom: 0.75rem;
  }

  .sync-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #22c55e;
    flex-shrink: 0;
  }

  .sync-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    overflow: hidden;
  }

  .sync-server { font-size: 0.875rem; font-weight: 600; }

  .sync-guid {
    font-size: 0.78rem;
    opacity: 0.55;
    font-family: monospace;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sync-secret-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.1rem;
  }

  .sync-secret-value {
    font-size: 0.78rem;
    font-family: monospace;
    opacity: 0.55;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .btn-reveal {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--accent);
    opacity: 0.8;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .btn-reveal:hover { opacity: 1; background: none; }

  .sync-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .btn-outline {
    background: none;
    border: 1px solid rgba(128, 128, 128, 0.35);
    color: inherit;
    font-size: 0.875rem;
  }

  .btn-outline:hover { background: rgba(128, 128, 128, 0.1); }

  .sync-unlink-confirm {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .sync-unlink-confirm span { font-weight: 500; }

  .sync-divider {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 0.78rem;
    opacity: 0.45;
    margin: 1.25rem 0;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .sync-divider::before,
  .sync-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(128, 128, 128, 0.25);
  }

  .manual-input-expanded { padding-top: 0.75rem; }

  .delete-confirm-label { font-weight: 500; font-size: 0.875rem; }

  .delete-confirm-note {
    font-size: 0.78rem;
    opacity: 0.55;
  }

.qr-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg);
    display: flex;
    flex-direction: column;
  }

  .qr-back {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 1rem 1.25rem;
    font-size: 1rem;
    color: inherit;
    opacity: 0.7;
    cursor: pointer;
  }

  .qr-back:hover { opacity: 1; background: none; }

  .qr-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 1rem 2rem 3rem;
  }

  .qr-image { border-radius: 12px; display: block; max-width: 100%; }

  .scan-video { width: 100%; max-width: 480px; border-radius: 12px; display: block; }

  .qr-hint {
    font-size: 0.9rem;
    opacity: 0.6;
    text-align: center;
    margin: 0;
    max-width: 280px;
  }

  .qr-warning {
    font-size: 0.82rem;
    color: var(--color-accent1);
    text-align: center;
    margin: 0;
    max-width: 280px;
  }
</style>
