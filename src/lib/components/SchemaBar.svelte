<script lang="ts">
  import { store } from '$lib/store.svelte';
  import QRCode from 'qrcode';
  import QrScanner from 'qr-scanner';
  import { showToast } from '$lib/toasts.svelte';
  import { shareSchema, fetchSharedSchema, parseShareCode } from '$lib/share';
  import type { SharedSchemaPayload } from '$lib/types';
  import { PenLine, Trash2, Share2, ScanLine, Plus, Copy } from 'lucide-svelte';

  // ── Schema selection & editing ────────────────────────────────
  let addingSchema = $state(false);
  let newSchemaName = $state('');
  let renaming = $state(false);
  let renameValue = $state('');
  let pendingDelete = $state(false);

  function handleAddSchema() {
    const name = newSchemaName.trim();
    if (!name) return;
    store.addSchema(name);
    newSchemaName = '';
    addingSchema = false;
  }

  function startRename() {
    renameValue = store.activeSchema?.name ?? '';
    renaming = true;
  }

  function confirmRename() {
    const id = store.activeSchemaId;
    if (id && renameValue.trim()) store.renameSchema(id, renameValue);
    renaming = false;
  }

  function handleDelete() {
    const id = store.activeSchemaId;
    pendingDelete = false;
    if (!id) return;
    store.removeSchema(id);
    showToast('Schema deleted', { type: 'info' });
  }

  // ── Sharing ───────────────────────────────────────────────────
  let shareBusy = $state(false);
  let share = $state<{ url: string; code: string; qr: string } | null>(null);

  async function handleShare() {
    const id = store.activeSchemaId;
    if (!id) return;
    const payload = store.schemaPayload(id);
    if (payload.exercises.length === 0) {
      showToast('Add an exercise before sharing this schema');
      return;
    }
    shareBusy = true;
    try {
      const { code, url } = await shareSchema(payload, store.syncConfig);
      const qr = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      share = { code, url, qr };
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Sharing failed — try again later.');
    } finally {
      shareBusy = false;
    }
  }

  async function copyShareLink() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
      showToast('Link copied', { type: 'info' });
    } catch {
      // WebView clipboard access can be denied — the link is on screen anyway.
      showToast('Could not copy — select the link to copy it manually');
    }
  }

  // ── Importing ─────────────────────────────────────────────────
  let importOpen = $state(false);
  let importCode = $state('');
  let importBusy = $state(false);
  let preview = $state<SharedSchemaPayload | null>(null);

  const isAndroid = navigator.userAgent.includes('Android');
  // Capability check only — never probe the camera here, or opening this tab
  // would trigger a permission prompt. See SettingsTab for the same reasoning.
  const hasCamera = isAndroid || !!navigator.mediaDevices?.getUserMedia;

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
      showScanOverlay = false;
    });
    return () => { qrScanner?.destroy(); qrScanner = null; };
  });

  async function scanForImport() {
    if (isAndroid) {
      importBusy = true;
      try {
        const { scan, checkPermissions, requestPermissions, Format } = await import('@tauri-apps/plugin-barcode-scanner');
        let permission = await checkPermissions();
        if (permission !== 'granted') permission = await requestPermissions();
        if (permission !== 'granted') {
          showToast('Camera permission is required to scan QR codes');
          return;
        }
        const result = await scan({ windowed: false, formats: [Format.QRCode] });
        await handleScannedContent(result.content);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
        console.error('Scan error:', e);
        if (msg !== 'scan cancelled') showToast(msg || 'Failed to scan QR code');
      } finally {
        importBusy = false;
      }
    } else {
      showScanOverlay = true;
    }
  }

  async function handleScannedContent(raw: string) {
    qrScanner?.stop();
    showScanOverlay = false;
    await loadSharedSchema(raw);
  }

  async function loadSharedSchema(raw: string) {
    const code = parseShareCode(raw);
    if (!code) {
      showToast('That is not a valid schema share code');
      return;
    }
    importBusy = true;
    try {
      preview = await fetchSharedSchema(code, store.syncConfig?.serverUrl);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Could not fetch that schema.');
    } finally {
      importBusy = false;
    }
  }

  function confirmImport() {
    if (!preview) return;
    const { count } = store.importSchema(preview);
    const name = preview.name;
    preview = null;
    importOpen = false;
    importCode = '';
    showToast(`Imported "${name}" with ${count} exercise${count === 1 ? '' : 's'}`, { type: 'info' });
  }

  function cancelImport() {
    preview = null;
    importCode = '';
    importOpen = false;
  }
</script>

<section class="schema-bar">
  <div class="schema-row">
    {#if renaming}
      <input
        class="schema-rename"
        type="text"
        bind:value={renameValue}
        onkeydown={(e) => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') renaming = false; }}
        onblur={confirmRename}
        autofocus
      />
      <button class="btn-icon btn-confirm" onclick={confirmRename} title="Confirm">✓</button>
      <button class="btn-icon btn-ghost" onclick={() => renaming = false} title="Cancel">✗</button>
    {:else}
      <select
        class="schema-select"
        value={store.activeSchemaId ?? ''}
        onchange={(e) => store.setActiveSchema((e.target as HTMLSelectElement).value)}
        aria-label="Active workout schema"
      >
        {#each store.schemaList as schema (schema.id)}
          <option value={schema.id}>{schema.name}</option>
        {/each}
      </select>

      <div class="schema-actions">
        <button class="btn-icon btn-ghost" onclick={startRename} title="Rename schema"><PenLine size={14} /></button>
        {#if store.liveSchemas.length > 1}
          {#if pendingDelete}
            <div class="delete-confirm">
              <span>Delete?</span>
              <button class="btn-icon btn-danger" onclick={handleDelete} title="Confirm">✓</button>
              <button class="btn-icon btn-ghost" onclick={() => pendingDelete = false} title="Cancel">✗</button>
            </div>
          {:else}
            <button class="btn-icon btn-ghost" onclick={() => pendingDelete = true} title="Delete schema and its exercises"><Trash2 size={14} /></button>
          {/if}
        {/if}
      </div>
    {/if}
  </div>

  {#if pendingDelete}
    <p class="schema-warning">
      Deletes this schema along with its {store.activeExercises.length} exercise{store.activeExercises.length === 1 ? '' : 's'} and their history.
    </p>
  {/if}

  <div class="schema-buttons">
    <button class="btn-schema" onclick={handleShare} disabled={shareBusy}>
      <Share2 size={14} />{shareBusy ? 'Sharing…' : 'Share'}
    </button>
    <button class="btn-schema" onclick={() => importOpen = true}>
      <ScanLine size={14} />Import
    </button>
    {#if addingSchema}
      <form class="new-schema-form" onsubmit={(e) => { e.preventDefault(); handleAddSchema(); }}>
        <input type="text" placeholder="Schema name..." bind:value={newSchemaName} autofocus />
        <button type="submit" disabled={!newSchemaName.trim()}>Create</button>
        <button type="button" class="btn-ghost" onclick={() => { addingSchema = false; newSchemaName = ''; }}>Cancel</button>
      </form>
    {:else}
      <button class="btn-schema" onclick={() => addingSchema = true}>
        <Plus size={14} />New schema
      </button>
    {/if}
  </div>
</section>

{#if importOpen && !preview}
  <div class="qr-overlay">
    <button class="qr-back" onclick={cancelImport}>← Back</button>
    <div class="qr-content">
      <h2 class="overlay-title">Import a schema</h2>
      {#if hasCamera}
        <button onclick={scanForImport} disabled={importBusy}>
          <ScanLine size={16} />{importBusy ? 'Working…' : 'Scan QR code'}
        </button>
        <p class="qr-hint">or enter the share code</p>
      {:else}
        <p class="qr-hint">Enter the share code from the person sharing the schema.</p>
      {/if}
      <form class="code-form" onsubmit={(e) => { e.preventDefault(); loadSharedSchema(importCode); }}>
        <input type="text" placeholder="Share code or link" bind:value={importCode} autocapitalize="off" autocomplete="off" spellcheck="false" />
        <button type="submit" disabled={importBusy || !importCode.trim()}>Look up</button>
      </form>
    </div>
  </div>
{/if}

{#if preview}
  <div class="qr-overlay">
    <button class="qr-back" onclick={cancelImport}>← Back</button>
    <div class="qr-content">
      <h2 class="overlay-title">{preview.name}</h2>
      <p class="qr-hint">{preview.exercises.length} exercise{preview.exercises.length === 1 ? '' : 's'}</p>
      <ul class="preview-list">
        {#each preview.exercises as exercise}
          <li>
            <span class="preview-name">{exercise.name}</span>
            {#if exercise.targetSets || exercise.targetReps}
              <span class="preview-targets">
                {exercise.targetSets ?? '–'} × {exercise.targetReps ?? '–'}
              </span>
            {/if}
          </li>
        {/each}
      </ul>
      <button onclick={confirmImport}>Import as new schema</button>
      <p class="qr-hint">Added alongside your existing schemas — nothing is overwritten, and it starts with no workout history.</p>
    </div>
  </div>
{/if}

{#if showScanOverlay}
  <div class="qr-overlay">
    <button class="qr-back" onclick={() => showScanOverlay = false}>← Back</button>
    <div class="qr-content">
      <video bind:this={scanVideoEl} class="scan-video"></video>
    </div>
  </div>
{/if}

{#if share}
  <div class="qr-overlay">
    <button class="qr-back" onclick={() => share = null}>← Back</button>
    <div class="qr-content">
      <img src={share.qr} alt="Schema sharing QR code" class="qr-image" />
      <p class="qr-hint">Have them scan this from the Import button in their app — or send them the code below.</p>
      <div class="share-code">{share.code}</div>
      <div class="share-link">
        <code>{share.url}</code>
        <button class="btn-icon btn-ghost" onclick={copyShareLink} title="Copy link"><Copy size={14} /></button>
      </div>
    </div>
  </div>
{/if}

<style>
  .schema-bar {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.25rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(128,128,128,0.15);
  }

  .schema-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .schema-select {
    flex: 1;
    font-size: 1rem;
    font-weight: 600;
    font-family: inherit;
  }

  .schema-rename { flex: 1; font-size: 1rem; font-weight: 600; }

  .schema-actions { display: flex; gap: 0.1rem; align-items: center; }

  .schema-warning {
    margin: 0;
    font-size: 0.8rem;
    color: var(--color-accent1);
  }

  .schema-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-items: center;
  }

  .btn-schema {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.82rem;
    padding: 0.35rem 0.7rem;
  }

  .new-schema-form {
    display: flex;
    gap: 0.4rem;
    flex: 1;
    min-width: 12rem;
  }

  .new-schema-form input { flex: 1; font-size: 0.85rem; padding: 0.35rem 0.5rem; }
  .new-schema-form button { font-size: 0.82rem; padding: 0.35rem 0.7rem; }

  /* Full-screen overlays — same shape as the sync QR overlays in SettingsTab */
  .qr-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: var(--bg);
    display: flex;
    flex-direction: column;
    overflow-y: auto;
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

  .qr-content button {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .overlay-title { margin: 0; font-size: 1.15rem; text-align: center; }

  .qr-image { border-radius: 12px; display: block; max-width: 100%; }
  .scan-video { width: 100%; max-width: 480px; border-radius: 12px; display: block; }

  .qr-hint {
    font-size: 0.9rem;
    opacity: 0.6;
    text-align: center;
    margin: 0;
    max-width: 300px;
  }

  .code-form {
    display: flex;
    gap: 0.4rem;
    width: 100%;
    max-width: 320px;
  }

  .code-form input { flex: 1; }

  .share-code {
    font-size: 1.35rem;
    font-weight: 600;
    letter-spacing: 0.12em;
    user-select: all;
  }

  .share-link {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    max-width: 100%;
  }

  .share-link code {
    font-size: 0.8rem;
    opacity: 0.7;
    word-break: break-all;
    user-select: all;
  }

  .preview-list {
    list-style: none;
    padding: 0;
    margin: 0;
    width: 100%;
    max-width: 320px;
    max-height: 45vh;
    overflow-y: auto;
    border-top: 1px solid rgba(128,128,128,0.15);
  }

  .preview-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    padding: 0.4rem 0;
    border-bottom: 1px solid rgba(128,128,128,0.08);
    font-size: 0.875rem;
  }

  .preview-name { font-weight: 500; }
  .preview-targets { font-size: 0.8rem; opacity: 0.5; white-space: nowrap; }
</style>
