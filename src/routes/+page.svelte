<script lang="ts">
  import { store } from '$lib/store.svelte';
  import type { Exercise, WorkoutEntry } from '$lib/types';
  import { version } from '../../package.json';
  import { flip } from 'svelte/animate';
  import { expoInOut } from 'svelte/easing';
  import { PenLine, Trash2, Cloud, CloudOff, RefreshCw } from 'lucide-svelte';
  import QRCode from 'qrcode';
  import { toasts, dismissToast, showToast } from '$lib/toasts.svelte';

  const UNDO_MS = 10_000;
  let undoPending = $state<Record<string, { timeoutId: ReturnType<typeof setTimeout>; entryId: string }>>({});

  function handleLogToday(exerciseId: string) {
    const date = today();
    store.logEntry(exerciseId, date);
    const entry = store.entries.find(e => e.exerciseId === exerciseId && e.date === date && !e.deletedAt);
    if (!entry) return;

    if (undoPending[exerciseId] !== undefined) clearTimeout(undoPending[exerciseId].timeoutId);
    undoPending[exerciseId] = {
      entryId: entry.id,
      timeoutId: setTimeout(() => { delete undoPending[exerciseId]; }, UNDO_MS)
    };
  }

  function handleUndoLog(exerciseId: string) {
    const pending = undoPending[exerciseId];
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    store.removeEntry(pending.entryId);
    delete undoPending[exerciseId];
  }

  $effect(() => {
    document.documentElement.setAttribute('data-theme', store.settings.theme);
  });

  type Tab = 'exercises' | 'priority' | 'settings';
  let activeTab = $state<Tab>('priority');
  let tabInitialized = false;

  $effect(() => {
    if (!tabInitialized && store.ready) {
      tabInitialized = true;
      if (store.activeExercises.length === 0) {
        activeTab = 'exercises';
        showToast('Welcome! Start by adding your exercises in the Setup exercises tab.');
      }
    }
  });

  // ── Add exercise ──────────────────────────────────────────────
  let newName = $state('');

  function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    store.addExercise(name);
    newName = '';
  }

  // ── Rename ────────────────────────────────────────────────────
  let editingId = $state<string | null>(null);
  let editingName = $state('');

  function startRename(exercise: Exercise) {
    editingId = exercise.id;
    editingName = exercise.name;
  }

  function confirmRename() {
    const name = editingName.trim();
    if (editingId && name) store.renameExercise(editingId, name);
    editingId = null;
  }

  function cancelRename() {
    editingId = null;
  }

  function onRenameKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmRename();
    if (e.key === 'Escape') cancelRename();
  }

  // ── Description ──────────────────────────────────────────────
  let editingDescId = $state<string | null>(null);
  let editingDescValue = $state('');

  function startEditDesc(exercise: Exercise) {
    editingDescId = exercise.id;
    editingDescValue = exercise.description ?? '';
  }

  function confirmDesc() {
    if (editingDescId !== null) store.updateDescription(editingDescId, editingDescValue);
    editingDescId = null;
  }

  function onDescKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmDesc();
    if (e.key === 'Escape') { editingDescId = null; }
  }

  // ── Delete confirmation ───────────────────────────────────────
  let pendingDeleteExercise = $state<string | null>(null);
  let pendingDeleteEntry = $state<string | null>(null);

  // ── History collapse ──────────────────────────────────────────
  let openHistory = $state<Record<string, boolean>>({});

  function toggleHistory(id: string) {
    openHistory[id] = !openHistory[id];
  }

  // ── Edit entry ───────────────────────────────────────────────
  let editingEntryId = $state<string | null>(null);
  let editingEntryDate = $state('');

  function startEditEntry(entry: WorkoutEntry) {
    editingEntryId = entry.id;
    editingEntryDate = entry.date;
  }

  function confirmEditEntry() {
    if (editingEntryId && editingEntryDate) store.updateEntry(editingEntryId, editingEntryDate);
    editingEntryId = null;
  }

  function cancelEditEntry() {
    editingEntryId = null;
  }

  function onEntryKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') confirmEditEntry();
    if (e.key === 'Escape') cancelEditEntry();
  }

  // ── Log workout ───────────────────────────────────────────────
  let selectedDates = $state<Record<string, string>>({});

  function getDate(id: string) {
    return selectedDates[id] ?? today();
  }

  function handleLog(exerciseId: string) {
    store.logEntry(exerciseId, getDate(exerciseId));
  }

  // ── Formatting ────────────────────────────────────────────────
  function today(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function calendarDiff(dateStr: string): number {
    const [y, m, d] = dateStr.split('-').map(Number);
    const entry = new Date(y, m - 1, d);
    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((todayMidnight.getTime() - entry.getTime()) / 86_400_000);
  }

  function fmtDate(dateStr: string) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function daysSince(dateStr: string | null): string {
    if (!dateStr) return 'Never done';
    const diff = calendarDiff(dateStr);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return `${diff} days ago`;
  }

  // ── Remote sync ───────────────────────────────────────────────
  let syncServerUrl = $state('https://api.theprocesstracker.com');
  let showQr = $state(false);
  let qrDataUrl = $state<string | null>(null);

  async function toggleQr() {
    if (showQr) {
      showQr = false;
      qrDataUrl = null;
      return;
    }
    const { guid, secret, serverUrl } = store.syncConfig!;
    const playStoreUrl = 'https://play.google.com/store/apps/details?id=com.theprocesstracker.app';
    const intentUrl =
      `intent://link?guid=${encodeURIComponent(guid)}` +
      `&secret=${encodeURIComponent(secret)}` +
      `&server=${encodeURIComponent(serverUrl)}` +
      `#Intent;scheme=theprocesstracker;package=com.theprocesstracker.app` +
      `;S.browser_fallback_url=${encodeURIComponent(playStoreUrl)};end`;
    qrDataUrl = await QRCode.toDataURL(intentUrl, {
      width: 240,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
    });
    showQr = true;
  }
  let linkGuid = $state('');
  let linkSecret = $state('');
  let syncBusy = $state(false);
  let unlinkPending = $state(false);
  let showSecret = $state(false);

  async function handleCreateAccount() {
    syncBusy = true;
    try {
      await store.createAccount(syncServerUrl);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      syncBusy = false;
    }
  }

  async function handleLinkAccount() {
    syncBusy = true;
    try {
      await store.linkAccount(syncServerUrl, linkGuid.trim(), linkSecret.trim());
      linkGuid = '';
      linkSecret = '';
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Failed to link account');
    } finally {
      syncBusy = false;
    }
  }

  function urgencyColor(lastDate: string | null): string {
    const { yellowAfterDays, redAfterDays } = store.settings;
    const days = lastDate ? calendarDiff(lastDate) : redAfterDays + 1;
    if (days <= 0) return 'hsl(120, 75%, 45%)';
    if (days >= redAfterDays) return 'hsl(0, 75%, 45%)';
    if (days <= yellowAfterDays) {
      const hue = 120 - (days / yellowAfterDays) * 60;
      return `hsl(${hue.toFixed(1)}, 75%, 45%)`;
    }
    const hue = 60 - ((days - yellowAfterDays) / (redAfterDays - yellowAfterDays)) * 60;
    return `hsl(${hue.toFixed(1)}, 75%, 45%)`;
  }
</script>

<div class="top-right-info">
  {#if store.syncConfig}
    <button
      class="sync-icon-btn"
      class:is-error={store.syncStatus === 'error'}
      class:is-syncing={store.syncStatus === 'syncing'}
      onclick={() => store.manualSync()}
      title={store.syncStatus === 'error' ? 'Sync failed — click to retry' : store.syncStatus === 'syncing' ? 'Syncing…' : 'Synced'}
    >
      {#if store.syncStatus === 'syncing'}
        <RefreshCw size={11} />
      {:else if store.syncStatus === 'error'}
        <CloudOff size={11} />
      {:else}
        <Cloud size={11} />
      {/if}
    </button>
  {/if}
  <span class="version">v{version}</span>
</div>

<div class="toast-container" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div class="toast">
      <span>{toast.message}</span>
      <button class="toast-dismiss" onclick={() => dismissToast(toast.id)}>✕</button>
    </div>
  {/each}
</div>

{#if !store.ready}
  <p class="loading">Loading…</p>
{/if}
<main class:hidden={!store.ready}>
  <header>
    <h1>The Process</h1>
    <p class="app-subtitle">Workout tracker</p>
    <nav class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'priority'}
        onclick={() => (activeTab = 'priority')}
      >Workout queue</button>
      <button
        class="tab"
        class:active={activeTab === 'exercises'}
        onclick={() => (activeTab = 'exercises')}
      >Setup exercises</button>
      <button
        class="tab"
        class:active={activeTab === 'settings'}
        onclick={() => (activeTab = 'settings')}
      >Settings</button>
    </nav>
  </header>

  <!-- ── Exercises tab ────────────────────────────────────────── -->
  {#if activeTab === 'exercises'}
    <section class="add-exercise">
      <form onsubmit={(e) => { e.preventDefault(); handleAdd(); }}>
        <input
          type="text"
          placeholder="New exercise name..."
          bind:value={newName}
        />
        <button type="submit" disabled={!newName.trim()}>Add exercise</button>
      </form>
    </section>

    {#if store.activeExercises.length === 0}
      <p class="empty">No exercises yet. Add one above to get started.</p>
    {:else}
      <ul class="exercise-list">
        {#each [...store.activeExercises].sort((a, b) => a.name.localeCompare(b.name)) as exercise (exercise.id)}
          {@const entries = store.entriesFor(exercise.id)}
          <li class="exercise-card">
            <div class="card-header">
              {#if editingId === exercise.id}
                <input
                  class="rename-input"
                  type="text"
                  bind:value={editingName}
                  onkeydown={onRenameKeydown}
                  onblur={confirmRename}
                  autofocus
                />
                <div class="rename-actions">
                  <button class="btn-icon btn-confirm" onclick={confirmRename} title="Confirm">✓</button>
                  <button class="btn-icon btn-ghost" onclick={cancelRename} title="Cancel">✗</button>
                </div>
              {:else}
                <h2>{exercise.name}</h2>
                <div class="header-actions">
                  <button class="btn-icon btn-ghost" onclick={() => startRename(exercise)} title="Rename"><PenLine size={14} /></button>
                  {#if pendingDeleteExercise === exercise.id}
                    <div class="delete-confirm">
                      <span>Delete?</span>
                      <button class="btn-icon btn-danger" onclick={() => { store.removeExercise(exercise.id); pendingDeleteExercise = null; }} title="Confirm">✓</button>
                      <button class="btn-icon btn-ghost" onclick={() => pendingDeleteExercise = null} title="Cancel">✗</button>
                    </div>
                  {:else}
                    <button class="btn-icon btn-ghost" onclick={() => pendingDeleteExercise = exercise.id} title="Delete"><Trash2 size={14} /></button>
                  {/if}
                </div>
              {/if}
            </div>

            <!-- Description -->
            {#if editingDescId === exercise.id}
              <input
                class="desc-input"
                type="text"
                placeholder="Add description..."
                bind:value={editingDescValue}
                onkeydown={onDescKeydown}
                onblur={confirmDesc}
                autofocus
              />
            {:else if exercise.description}
              <button class="desc-text" onclick={() => startEditDesc(exercise)} title="Edit description">{exercise.description}</button>
            {:else}
              <button class="btn-add-desc" onclick={() => startEditDesc(exercise)}>+ Add description</button>
            {/if}

            <!-- History toggle -->
            <button
              class="btn-history-toggle"
              onclick={() => toggleHistory(exercise.id)}
            >
              History
              <span class="toggle-arrow">{openHistory[exercise.id] ? '▲' : '▼'}</span>
            </button>

            <!-- Collapsible history panel -->
            {#if openHistory[exercise.id]}
              <div class="history-panel">
                <div class="log-row">
                  <input
                    type="date"
                    value={getDate(exercise.id)}
                    onchange={(e) => { selectedDates[exercise.id] = (e.target as HTMLInputElement).value; }}
                  />
                  <button onclick={() => handleLog(exercise.id)}>Log workout</button>
                </div>

                {#if entries.length > 0}
                  <ul class="entry-list">
                    {#each entries as entry (entry.id)}
                      <li>
                        {#if editingEntryId === entry.id}
                          <input
                            class="entry-date-input"
                            type="date"
                            bind:value={editingEntryDate}
                            onkeydown={onEntryKeydown}
                            onblur={confirmEditEntry}
                            autofocus
                          />
                          <div class="entry-actions">
                            <button class="btn-icon btn-confirm" onclick={confirmEditEntry} title="Save">✓</button>
                            <button class="btn-icon btn-ghost" onclick={cancelEditEntry} title="Cancel">✗</button>
                          </div>
                        {:else}
                          <span>{fmtDate(entry.date)}</span>
                          <div class="entry-actions">
                            <button class="btn-icon btn-ghost" onclick={() => startEditEntry(entry)} title="Edit date"><PenLine size={14} /></button>
                            {#if pendingDeleteEntry === entry.id}
                              <div class="delete-confirm">
                                <span>Delete?</span>
                                <button class="btn-icon btn-danger" onclick={() => { store.removeEntry(entry.id); pendingDeleteEntry = null; }} title="Confirm">✓</button>
                                <button class="btn-icon btn-ghost" onclick={() => pendingDeleteEntry = null} title="Cancel">✗</button>
                              </div>
                            {:else}
                              <button class="btn-icon btn-ghost" onclick={() => pendingDeleteEntry = entry.id} title="Delete"><Trash2 size={14} /></button>
                            {/if}
                          </div>
                        {/if}
                      </li>
                    {/each}
                  </ul>
                {:else}
                  <p class="no-entries">No entries yet.</p>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

  <!-- ── Priority queue tab ────────────────────────────────────── -->
  {:else if activeTab === 'priority'}
    {#if store.activeExercises.length === 0}
      <p class="empty">Add exercises in the Setup exercises tab first.</p>
    {:else}
      <p class="priority-hint">Exercises you've gone the longest without are listed first.</p>
      <ol class="priority-list">
        {#each store.priorityCue as { exercise, lastDate }, i (exercise.id)}
          <li
            class="priority-card"
            style="border-left-color: {urgencyColor(lastDate)}"
            animate:flip={{ duration: 650, easing: expoInOut }}
          >
            <div class="priority-rank">{i + 1}</div>
            <div class="priority-info">
              <span class="priority-name">{exercise.name}</span>
              <span class="priority-last">
                {#if lastDate}
                  Last done {daysSince(lastDate)} &middot; {fmtDate(lastDate)}
                {:else}
                  Never done
                {/if}
              </span>
            </div>
            {#if undoPending[exercise.id] !== undefined}
              <button class="btn-undo" onclick={() => handleUndoLog(exercise.id)}>Undo</button>
            {:else}
              <button onclick={() => handleLogToday(exercise.id)}>Log today</button>
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

  <!-- ── Settings tab ─────────────────────────────────────────── -->
  {:else if activeTab === 'settings'}
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

      <h2 style="margin-top: 1.75rem;">Priority queue colors</h2>
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
          <div class="preview-swatch" style="background: {urgencyColor(
            (() => { const d = new Date(); d.setDate(d.getDate() - day); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()
          )}">
            <span>{day === 0 ? 'Today' : day === 1 ? '1 day' : `${day} days`}</span>
          </div>
        {/each}
      </div>

      <div class="section-heading" style="margin-top: 1.75rem;">
        <h2>Remote sync</h2>
        <span class="tooltip-wrap">
          <span class="tooltip-icon">?</span>
          <span class="tooltip-box">
            Remote sync is completely optional — the app works just as well in standalone mode.
            If you choose to create an account, it's free and anonymous.
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
          <button class="btn-outline" onclick={toggleQr}>
            {showQr ? 'Hide QR code' : 'Link mobile app'}
          </button>
          {#if unlinkPending}
            <div class="sync-unlink-confirm">
              <span>Unlink?</span>
              <button class="btn-icon btn-danger" onclick={() => { store.unlinkAccount(); unlinkPending = false; showQr = false; qrDataUrl = null; }} title="Confirm">✓</button>
              <button class="btn-icon btn-ghost" onclick={() => (unlinkPending = false)} title="Cancel">✗</button>
            </div>
          {:else}
            <button class="btn-outline" onclick={() => (unlinkPending = true)}>Unlink account</button>
          {/if}
        </div>

        {#if showQr && qrDataUrl}
          <div class="qr-panel">
            <img src={qrDataUrl} alt="Account linking QR code" class="qr-code" />
            <p class="qr-hint">Scan with your Android phone. Opens the app if installed, or takes you to the Play Store.</p>
            <p class="qr-warning">Keep this QR code private — it contains your account credentials.</p>
          </div>
        {/if}
      {:else}
        <button onclick={handleCreateAccount} disabled={syncBusy || !syncServerUrl.trim()}>
          {syncBusy ? 'Creating…' : 'Create new account'}
        </button>

        <div class="sync-divider">or link an existing account</div>

        <div class="setting-row">
          <label for="link-guid">GUID</label>
          <input id="link-guid" type="text" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" bind:value={linkGuid} />
        </div>
        <div class="setting-row">
          <label for="link-secret">Secret</label>
          <input id="link-secret" type="text" placeholder="64-character secret key" bind:value={linkSecret} />
        </div>
        <button
          onclick={handleLinkAccount}
          disabled={syncBusy || !syncServerUrl.trim() || !linkGuid.trim() || !linkSecret.trim()}
        >
          {syncBusy ? 'Linking…' : 'Link account'}
        </button>

        <details class="sync-advanced">
          <summary>Advanced</summary>
          <div class="setting-row">
            <label for="sync-server-url">Server URL</label>
            <input
              id="sync-server-url"
              type="text"
              bind:value={syncServerUrl}
            />
          </div>
        </details>

      {/if}
    </section>
  {/if}
</main>

<style>
  :global(*, *::before, *::after) { box-sizing: border-box; }

  :global(html) {
    /* Brand palette */
    --color-primary:   #2C3947;
    --color-secondary: #547A95;
    --color-accent1:   #C2A56D;
    --color-accent2:   #E8EDF2;

    /* Light mode */
    --bg: #E8EDF2;
    --text: #1a1a1a;
    --card-bg: #ffffff;
    --card-border: rgba(44, 57, 71, 0.14);
    --interactive: #2C3947;
    --interactive-hover: #547A95;
    --interactive-text: #ffffff;
    --accent: #547A95;
  }

  @media (prefers-color-scheme: dark) {
    :global(html:not([data-theme='light'])) {
      --bg: #2C3947;
      --text: #E8EDF2;
      --card-bg: #547A95;
      --card-border: rgba(232, 237, 242, 0.08);
      --interactive: #C2A56D;
      --interactive-hover: #a88a52;
      --interactive-text: #1a1a1a;
      --accent: #C2A56D;
    }
  }

  :global(html[data-theme='dark']) {
    --bg: #2C3947;
    --text: #E8EDF2;
    --card-bg: #547A95;
    --card-border: rgba(232, 237, 242, 0.08);
    --interactive: #C2A56D;
    --interactive-hover: #a88a52;
    --interactive-text: #1a1a1a;
    --accent: #C2A56D;
  }

  :global(body) {
    margin: 0;
    font-family: Inter, Avenir, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.5;
    color: var(--text);
    background: var(--bg);
  }

  .loading {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.4;
    font-size: 0.9rem;
  }

  .hidden { visibility: hidden; }

  main {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }

  /* ── Header & tabs ── */
  header { margin-bottom: 1.5rem; }

  header h1 {
    margin: 0 0 0;
    font-size: 2.5rem;
    font-weight: 700;
    font-family: 'Iceland', sans-serif;
    display: inline-block;
    padding: 0.1em 0.35em;
    background-position: 0 0, 0 0.5em, 0.5em -0.5em, -0.5em 0;
    color: var(--text);
  }

  .app-subtitle {
    position: relative;
    top: -0.5em;
    margin: 0 1rem 1rem;
    font-size: 0.8rem;
    opacity: 0.4;
    font-weight: 500;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .top-right-info {
    position: fixed;
    top: 0.75rem;
    right: 1rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    pointer-events: none;
  }

  .version {
    font-size: 0.7rem;
    opacity: 0.35;
    letter-spacing: 0.02em;
  }

  .sync-icon-btn {
    pointer-events: auto;
    background: none;
    border: none;
    padding: 0.15rem;
    opacity: 0.35;
    color: inherit;
    cursor: pointer;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: opacity 0.15s;
  }

  .sync-icon-btn:hover { opacity: 0.75; background: none; }
  .sync-icon-btn:not(.is-error):not(.is-syncing) { opacity: 1; color: #22c55e; }
  .sync-icon-btn.is-error { opacity: 1; color: #ef4444; }
  .sync-icon-btn.is-syncing { opacity: 0.6; color: inherit; }
  .sync-icon-btn.is-syncing :global(svg) { animation: spin 1s linear infinite; }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── Toasts ── */
  .toast-container {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    z-index: 100;
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: #1f2937;
    color: #f9fafb;
    padding: 0.65rem 0.6rem 0.65rem 1rem;
    border-radius: 10px;
    font-size: 0.875rem;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
    border-left: 3px solid #ef4444;
    min-width: 260px;
    max-width: 420px;
    white-space: pre-wrap;
  }

  .toast-dismiss {
    background: none;
    border: none;
    color: #f9fafb;
    opacity: 0.45;
    padding: 0.1rem 0.35rem;
    font-size: 0.8rem;
    cursor: pointer;
    margin-left: auto;
    flex-shrink: 0;
  }

  .toast-dismiss:hover { opacity: 1; background: none; }

  .tabs {
    display: flex;
    gap: 0.25rem;
    border-bottom: 2px solid rgba(128,128,128,0.2);
    padding-bottom: 0;
  }

  .tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    padding: 0.4rem 1rem;
    font-size: 0.9rem;
    font-weight: 500;
    color: inherit;
    opacity: 0.5;
    cursor: pointer;
    border-radius: 0;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .tab:hover { opacity: 0.8; background: none; }
  .tab.active { opacity: 1; border-bottom-color: var(--accent); }

  /* ── Inputs & buttons ── */
  input[type='text'],
  input[type='date'] {
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(128,128,128,0.35);
    background: transparent;
    color: inherit;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
  }

  input[type='text']:focus,
  input[type='date']:focus { border-color: var(--accent); }

  button {
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid transparent;
    background: var(--interactive);
    color: var(--interactive-text);
    font-size: 0.9rem;
    font-family: inherit;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
  }

  button:hover { background: var(--interactive-hover); }
  button:disabled { opacity: 0.4; cursor: default; }

  .btn-icon {
    padding: 0.15rem 0.4rem;
    font-size: 1.1rem;
    line-height: 1;
    background: none;
    border: none;
    display: inline-flex;
    align-items: center;
  }

  .btn-danger { color: #ef4444; }
  .btn-danger:hover { background: rgba(239,68,68,0.1); }

  .delete-confirm {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  .delete-confirm span {
    font-size: 0.78rem;
    font-weight: 600;
    color: #ef4444;
    white-space: nowrap;
  }

  .btn-confirm { color: #22c55e; }
  .btn-confirm:hover { background: rgba(34,197,94,0.1); }

  .btn-ghost { color: inherit; opacity: 0.4; }
  .btn-ghost:hover { opacity: 0.8; background: rgba(128,128,128,0.1); }

  /* ── Add exercise ── */
  .add-exercise form { display: flex; gap: 0.5rem; }
  .add-exercise input { flex: 1; }

  .empty {
    text-align: center;
    opacity: 0.45;
    margin-top: 4rem;
    font-size: 0.95rem;
  }

  /* ── Exercise cards ── */
  .exercise-list {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .exercise-card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: 12px;
    padding: 1rem 1.25rem;
  }

  .card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
  }

  .card-header h2 { margin: 0; font-size: 1.05rem; font-weight: 600; }

  .rename-input { flex: 1; font-size: 1rem; font-weight: 600; }

  .header-actions,
  .rename-actions { display: flex; gap: 0.1rem; align-items: center; }

  .log-row { display: flex; gap: 0.5rem; align-items: center; }
  .log-row input[type='date'] { flex: 1; }

  .entry-list {
    list-style: none;
    padding: 0;
    margin: 0.75rem 0 0;
    border-top: 1px solid rgba(128,128,128,0.15);
  }

  .entry-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.35rem 0;
    border-bottom: 1px solid rgba(128,128,128,0.08);
    font-size: 0.875rem;
    opacity: 0.85;
  }

  .entry-date-input { flex: 1; padding: 0.25rem 0.5rem; font-size: 0.875rem; }
  .entry-actions { display: flex; gap: 0.1rem; align-items: center; }

  /* ── Description ── */
  .desc-input {
    width: 100%;
    margin: 0.25rem 0 0.5rem;
    font-size: 0.875rem;
    padding: 0.3rem 0.5rem;
    border-radius: 6px;
  }

  .desc-text {
    display: block;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: inherit;
    padding: 0.1rem 0;
    margin: 0.1rem 0 0.4rem;
    font-size: 0.875rem;
    font-family: inherit;
    opacity: 0.55;
    cursor: text;
  }

  .desc-text:hover { opacity: 0.85; background: none; }

  .btn-add-desc {
    background: none;
    border: none;
    padding: 0.1rem 0;
    margin: 0.1rem 0 0.4rem;
    font-size: 0.8rem;
    font-family: inherit;
    opacity: 0.35;
    cursor: pointer;
    color: inherit;
  }

  .btn-add-desc:hover { opacity: 0.65; background: none; }

  /* ── History toggle ── */
  .btn-history-toggle {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    margin-top: 0.5rem;
    background: none;
    border: none;
    color: inherit;
    font-size: 0.82rem;
    font-weight: 600;
    opacity: 0.45;
    cursor: pointer;
    padding: 0.2rem 0;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .btn-history-toggle:hover { opacity: 0.75; background: none; }
  .toggle-arrow { font-size: 0.65rem; }

  /* ── History panel ── */
  .history-panel {
    margin-top: 0.75rem;
    border-top: 1px solid rgba(128,128,128,0.15);
    padding-top: 0.75rem;
  }

  .no-entries {
    font-size: 0.85rem;
    opacity: 0.4;
    margin: 0.5rem 0 0;
    text-align: center;
  }

  /* ── Priority queue ── */
  .priority-hint {
    font-size: 0.875rem;
    opacity: 0.55;
    margin: 0 0 1rem;
  }

  .priority-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .priority-card {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: 1rem;
    background: var(--card-bg);
    border-left: 4px solid transparent;
    border-radius: 10px;
    padding: 0.75rem 1rem;
  }


  .btn-undo {
    position: relative;
    overflow: hidden;
    background: var(--color-accent1);
    color: #1a1a1a;
    min-width: 5.5rem;
  }

  .btn-undo:hover { background: #a88a52; }

  .btn-undo::before {
    content: '';
    position: absolute;
    inset: 0;
    right: auto;
    width: 100%;
    background: rgba(255, 255, 255, 0.3);
    animation: btn-countdown 10s linear forwards;
    pointer-events: none;
  }

  @keyframes btn-countdown {
    from { width: 100%; }
    to   { width: 0%; }
  }



  .priority-rank {
    font-size: 1rem;
    font-weight: 700;
    opacity: 0.35;
    min-width: 1.5rem;
    text-align: right;
  }

  .priority-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .priority-name { font-weight: 600; font-size: 0.95rem; }

  .priority-last { font-size: 0.8rem; opacity: 0.55; }

  /* ── Settings ── */
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

  .setting-row label {
    font-size: 0.9rem;
    font-weight: 500;
  }

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

  /* ── Section heading with tooltip ── */
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

  .tooltip-wrap:hover .tooltip-box {
    visibility: visible;
    opacity: 1;
  }

  /* ── Remote sync ── */
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

  .sync-unlink-confirm {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
  }

  .sync-unlink-confirm span { font-weight: 500; }

  .btn-outline {
    background: none;
    border: 1px solid rgba(128, 128, 128, 0.35);
    color: inherit;
    font-size: 0.875rem;
  }

  .btn-outline:hover { background: rgba(128, 128, 128, 0.1); }

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


  .sync-advanced {
    margin-top: 1rem;
  }

  .sync-advanced summary {
    cursor: pointer;
    font-size: 0.85rem;
    color: var(--text-muted, #6b7280);
    user-select: none;
  }

  .sync-advanced .setting-row {
    margin-top: 0.5rem;
  }

  .sync-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .qr-panel {
    margin-top: 1rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.6rem;
  }

  .qr-code {
    border-radius: 10px;
    display: block;
  }

  .qr-hint {
    font-size: 0.85rem;
    opacity: 0.6;
    text-align: center;
    margin: 0;
  }

  .qr-warning {
    font-size: 0.8rem;
    color: var(--color-accent1);
    text-align: center;
    margin: 0;
  }
</style>
