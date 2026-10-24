<script lang="ts">
  import { store } from '$lib/store.svelte';
  import { ui, currentOverlay, openOverlay } from '$lib/ui.svelte';
  import { Cloud, CloudOff, RefreshCw, WifiOff, LogIn, LogOut, Info, Sun, Moon, SunMoon } from 'lucide-svelte';
  import { showToast } from '$lib/toasts.svelte';
  import ExercisesTab from '$lib/components/ExercisesTab.svelte';
  import WorkoutQueueTab from '$lib/components/WorkoutQueueTab.svelte';
  import SettingsTab from '$lib/components/SettingsTab.svelte';
  import HistoryTab from '$lib/components/HistoryTab.svelte';
  import AboutSheet from '$lib/components/AboutSheet.svelte';
  import AuthModal from '$lib/components/AuthModal.svelte';
  import LinkDeviceModal from '$lib/components/LinkDeviceModal.svelte';

  type Tab = 'exercises' | 'priority' | 'history' | 'settings';
  // A share link lands on the Exercises tab, where the import preview opens.
  let activeTab = $state<Tab>(ui.pendingShareCode ? 'exercises' : 'priority');
  let tabInitialized = false;

  $effect(() => {
    if (!tabInitialized && store.ready) {
      tabInitialized = true;
      if (store.activeExercises.length === 0 && !ui.pendingShareCode) {
        activeTab = 'exercises';
        if (store.syncConfig) {
          showToast('Welcome! Start by adding your exercises in the Setup exercises tab.', { type: 'info', persistent: true });
        }
      }
    }
  });

  const syncTitle = $derived(
    store.syncStatus === 'error' ? 'Sync failed — click to retry'
    : store.syncStatus === 'syncing' ? 'Syncing…'
    : store.syncStatus === 'offline' ? "Offline — changes will sync when you're back online"
    : 'Synced'
  );

  const overlay = $derived(currentOverlay());

  // The theme button cycles system → light → dark.
  const nextTheme = { system: 'light', light: 'dark', dark: 'system' } as const;
  const themeTitle = $derived(
    `Theme: ${store.settings.theme} — click for ${nextTheme[store.settings.theme]}`
  );

  let loggingOut = $state(false);

  async function handleLogout(force = false) {
    loggingOut = true;
    try {
      if (await store.logout(force)) {
        showToast('Logged out. This device has been cleared.', { type: 'info' });
      } else {
        showToast(
          "Some changes on this device haven't reached the server yet, and syncing isn't possible right now. Logging out clears this device, so those changes would be lost.",
          { duration: 12000, action: { label: 'Log out anyway', run: () => handleLogout(true) } }
        );
      }
    } finally {
      loggingOut = false;
    }
  }
</script>

{#if !store.ready}
  <p class="loading">Loading…</p>
{/if}
<!-- Inert while an overlay is open: only the app itself, so popups that
     password managers inject into the page stay usable over the modal. -->
<main class:hidden={!store.ready} inert={!!overlay}>
  <header>
    <div class="title-row">
      <h1>The Process</h1>
      <button
        class="theme-btn"
        onclick={() => store.updateSettings({ theme: nextTheme[store.settings.theme] })}
        title={themeTitle}
        aria-label={themeTitle}
      >
        {#if store.settings.theme === 'light'}
          <Sun size={16} />
        {:else if store.settings.theme === 'dark'}
          <Moon size={16} />
        {:else}
          <SunMoon size={16} />
        {/if}
      </button>
      <button class="about-btn" onclick={() => openOverlay('about')} title="About The Process">
        <Info size={16} /><span class="about-label">About</span>
      </button>
      {#if store.sessionExpired}
        <button class="header-link is-warning" onclick={() => openOverlay('login')}><LogIn size={14} />Log in again</button>
      {:else if store.syncConfig}
        <button
          class="sync-icon-btn"
          class:is-error={store.syncStatus === 'error'}
          class:is-syncing={store.syncStatus === 'syncing'}
          class:is-offline={store.syncStatus === 'offline'}
          onclick={() => store.manualSync()}
          title={syncTitle}
        >
          {#if store.syncStatus === 'syncing'}
            <RefreshCw size={16} />
          {:else if store.syncStatus === 'error'}
            <CloudOff size={16} />
          {:else if store.syncStatus === 'offline'}
            <WifiOff size={16} />
          {:else}
            <Cloud size={16} />
          {/if}
        </button>
      {:else}
        <button class="header-link" onclick={() => openOverlay('login')}><LogIn size={14} />Log in</button>
      {/if}
      {#if store.account}
        <button class="header-link" onclick={() => handleLogout()} disabled={loggingOut} title="Log out">
          <LogOut size={14} /><span class="logout-label">Log out</span>
        </button>
      {/if}
    </div>
    <p class="app-subtitle">Workout tracker</p>
    <nav class="tabs">
      <button class="tab" class:active={activeTab === 'priority'} onclick={() => (activeTab = 'priority')}>Workout queue</button>
      <button class="tab" class:active={activeTab === 'exercises'} onclick={() => (activeTab = 'exercises')}>Setup exercises</button>
      <button class="tab" class:active={activeTab === 'history'} onclick={() => (activeTab = 'history')}>History</button>
      <button class="tab" class:active={activeTab === 'settings'} onclick={() => (activeTab = 'settings')}>Settings</button>
    </nav>
  </header>

  {#if activeTab === 'exercises'}
    <ExercisesTab />
  {:else if activeTab === 'priority'}
    <WorkoutQueueTab />
  {:else if activeTab === 'history'}
    <HistoryTab />
  {:else if activeTab === 'settings'}
    <SettingsTab />
  {/if}
</main>

{#if overlay === 'about'}
  <AboutSheet />
{:else if overlay === 'link-device'}
  <LinkDeviceModal />
{:else if overlay}
  <AuthModal />
{/if}

<style>
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
    white-space: nowrap;
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

  .theme-btn {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    background: none;
    border: none;
    padding: 0.3rem;
    color: inherit;
    opacity: 0.55;
  }

  .theme-btn:hover { opacity: 1; background: rgba(128, 128, 128, 0.1); }

  .about-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    background: none;
    border: none;
    padding: 0.3rem 0.5rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: inherit;
    opacity: 0.55;
  }

  .about-btn:hover { opacity: 1; background: rgba(128, 128, 128, 0.1); }

  /* Phones: the title, About and Log in/out share one row — keep them to the icon. */
  @media (max-width: 420px) {
    .about-label, .logout-label { display: none; }
  }

  .sync-icon-btn {
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
  .sync-icon-btn:not(.is-error):not(.is-syncing):not(.is-offline) { opacity: 1; color: #22c55e; }
  .sync-icon-btn.is-error { opacity: 1; color: #ef4444; }
  .sync-icon-btn.is-syncing { opacity: 0.6; color: inherit; }
  .sync-icon-btn.is-syncing :global(svg) { animation: spin 1s linear infinite; }
  .sync-icon-btn.is-offline { opacity: 0.6; color: inherit; }

  .header-link {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: inherit;
    text-decoration: none;
    opacity: 0.7;
    padding: 0.3rem 0.6rem;
    border-radius: 8px;
    border: 1px solid rgba(128, 128, 128, 0.3);
    background: none;
    white-space: nowrap;
  }

  .header-link:hover { opacity: 1; background: rgba(128, 128, 128, 0.1); }
  .header-link.is-warning { opacity: 1; color: var(--color-accent1); border-color: currentColor; }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

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
    padding: 0.4rem 0.75rem;
    font-size: 0.9rem;
    white-space: nowrap;
    font-weight: 500;
    color: inherit;
    opacity: 0.5;
    cursor: pointer;
    border-radius: 0;
    transition: opacity 0.15s, border-color 0.15s;
  }

  .tab:hover { opacity: 0.8; background: none; }
  .tab.active { opacity: 1; border-bottom-color: var(--accent); }

  /* Phones: four tabs don't fit on one line — let the two-word labels wrap. */
  @media (max-width: 480px) {
    .tab {
      flex: 1 1 auto;
      white-space: normal;
      line-height: 1.25;
      padding: 0.4rem 0.35rem;
    }
  }
</style>
