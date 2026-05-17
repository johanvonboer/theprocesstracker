<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { Cloud, CloudOff, RefreshCw } from 'lucide-svelte';
  import { toasts, dismissToast, showToast } from '$lib/toasts.svelte';
  import ExercisesTab from '$lib/components/ExercisesTab.svelte';
  import WorkoutQueueTab from '$lib/components/WorkoutQueueTab.svelte';
  import SettingsTab from '$lib/components/SettingsTab.svelte';
  import AboutTab from '$lib/components/AboutTab.svelte';
  $effect(() => {
    document.documentElement.setAttribute('data-theme', store.settings.theme);
  });

  type Tab = 'exercises' | 'priority' | 'settings' | 'about';
  let activeTab = $state<Tab>('priority');
  let tabInitialized = false;

  $effect(() => {
    if (!tabInitialized && store.ready) {
      tabInitialized = true;
      if (store.activeExercises.length === 0) {
        activeTab = 'exercises';
        showToast('Welcome! Start by adding your exercises in the Setup exercises tab.', { type: 'info', persistent: true });
      }
    }
  });
</script>


<div class="toast-container" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div
      class="toast"
      class:toast-info={toast.type === 'info'}
      class:toast-persistent={toast.persistent}
      onclick={toast.persistent ? () => dismissToast(toast.id) : undefined}
      role={toast.persistent ? 'button' : undefined}
    >
      <span>{toast.message}</span>
      {#if toast.persistent}
        <span class="toast-tap-hint">Tap to dismiss</span>
      {:else}
        <button class="toast-dismiss" onclick={() => dismissToast(toast.id)}>✕</button>
      {/if}
    </div>
  {/each}
</div>

{#if !store.ready}
  <p class="loading">Loading…</p>
{/if}
<main class:hidden={!store.ready}>
  <header>
    <div class="title-row">
      <h1>The Process</h1>
      {#if store.syncConfig}
        <button
          class="sync-icon-btn"
          class:is-error={store.syncStatus === 'error'}
          class:is-syncing={store.syncStatus === 'syncing'}
          onclick={() => store.manualSync()}
          title={store.syncStatus === 'error' ? 'Sync failed — click to retry' : store.syncStatus === 'syncing' ? 'Syncing…' : 'Synced'}
        >
          {#if store.syncStatus === 'syncing'}
            <RefreshCw size={16} />
          {:else if store.syncStatus === 'error'}
            <CloudOff size={16} />
          {:else}
            <Cloud size={16} />
          {/if}
        </button>
      {/if}
    </div>
    <p class="app-subtitle">Workout tracker</p>
    <nav class="tabs">
      <button class="tab" class:active={activeTab === 'priority'} onclick={() => (activeTab = 'priority')}>Workout queue</button>
      <button class="tab" class:active={activeTab === 'exercises'} onclick={() => (activeTab = 'exercises')}>Setup exercises</button>
      <button class="tab" class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>Settings</button>
      <button class="tab" class:active={activeTab === 'about'} onclick={() => (activeTab = 'about')}>About</button>
    </nav>
  </header>

  {#if activeTab === 'exercises'}
    <ExercisesTab />
  {:else if activeTab === 'priority'}
    <WorkoutQueueTab />
  {:else if activeTab === 'settings'}
    <SettingsTab />
  {:else if activeTab === 'about'}
    <AboutTab />
  {/if}
</main>

<style>
  /* ── Global resets & design tokens ── */
  :global(*, *::before, *::after) { box-sizing: border-box; }

  :global(html) {
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

  /* ── Base element styles (shared across all components) ── */
  :global(input[type='text']),
  :global(input[type='date']) {
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    border: 1px solid rgba(128,128,128,0.35);
    background: transparent;
    color: inherit;
    font-size: 0.9rem;
    font-family: inherit;
    outline: none;
  }

  :global(input[type='text']:focus),
  :global(input[type='date']:focus) { border-color: var(--accent); }

  :global(button) {
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

  :global(button:hover) { background: var(--interactive-hover); }
  :global(button:disabled) { opacity: 0.4; cursor: default; }

  /* ── Shared utility classes ── */
  :global(.btn-icon) {
    padding: 0.15rem 0.4rem;
    font-size: 1.1rem;
    line-height: 1;
    background: none;
    border: none;
    display: inline-flex;
    align-items: center;
  }

  :global(.btn-danger) { color: #ef4444; }
  :global(.btn-danger:hover) { background: rgba(239,68,68,0.1); }

  :global(.btn-confirm) { color: #22c55e; }
  :global(.btn-confirm:hover) { background: rgba(34,197,94,0.1); }

  :global(.btn-ghost) { color: inherit; opacity: 0.4; }
  :global(.btn-ghost:hover) { opacity: 0.8; background: rgba(128,128,128,0.1); }

  :global(.delete-confirm) {
    display: flex;
    align-items: center;
    gap: 0.15rem;
  }

  :global(.delete-confirm span) {
    font-size: 0.78rem;
    font-weight: 600;
    color: #ef4444;
    white-space: nowrap;
  }

  :global(.empty) {
    text-align: center;
    opacity: 0.45;
    margin-top: 4rem;
    font-size: 0.95rem;
  }

  /* ── Page layout ── */
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

  header { margin-bottom: 1.5rem; }

  header h1 {
    margin: 0;
    font-size: 2.5rem;
    font-weight: 700;
    font-family: 'Iceland', sans-serif;
    display: inline-block;
    padding: 0.1em 0.35em;
    background-position: 0 0, 0 0.5em, 0.5em -0.5em, -0.5em 0;
    color: var(--text);
    margin-top: 0;
    padding-top: 0;
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

  /* ── Title row with inline sync indicator ── */
  .title-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .sync-icon-btn {
    margin-left: auto;
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
    top: 3.5rem;
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

  .toast-info { border-left-color: #60a5fa; }

  .toast-persistent { cursor: pointer; }
  .toast-persistent:hover { background: #2d3748; }

  .toast-tap-hint {
    margin-left: auto;
    flex-shrink: 0;
    font-size: 0.75rem;
    opacity: 0.4;
    white-space: nowrap;
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

  /* ── Tab navigation ── */
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
</style>
