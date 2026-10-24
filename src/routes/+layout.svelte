<script lang="ts">
  import '@fontsource/iceland';
  import { onMount, type Snippet } from 'svelte';
  import { dev } from '$app/environment';
  import { store } from '$lib/store.svelte';
  import { toasts, dismissToast, showToast } from '$lib/toasts.svelte';

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    document.documentElement.setAttribute('data-theme', store.settings.theme);
  });

  onMount(() => {
    if (!dev && 'serviceWorker' in navigator) registerServiceWorker();
  });

  /**
   * The service worker keeps the app openable offline. A new deploy installs a
   * new worker in the background; it waits until the user chooses to reload,
   * so a workout in progress is never interrupted by a surprise refresh.
   */
  async function registerServiceWorker() {
    let reloadRequested = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadRequested) location.reload();
    });
    const offerUpdate = (worker: ServiceWorker) => {
      showToast('A new version of the app is available.', {
        type: 'info',
        persistent: true,
        action: { label: 'Reload', run: () => { reloadRequested = true; worker.postMessage('skip-waiting'); } },
      });
    };

    try {
      const reg = await navigator.serviceWorker.register('/service-worker.js');
      // Only an update when a worker already controls the page — the very
      // first install has nothing to replace.
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
    } catch {}
  }
</script>

<div class="toast-container" aria-live="polite">
  {#each toasts as toast (toast.id)}
    <div
      class="toast"
      class:toast-info={toast.type === 'info'}
      class:toast-persistent={toast.persistent && !toast.action}
      onclick={toast.persistent && !toast.action ? () => dismissToast(toast.id) : undefined}
      role={toast.persistent && !toast.action ? 'button' : undefined}
    >
      <span>{toast.message}</span>
      {#if toast.action}
        <button class="toast-action" onclick={() => { dismissToast(toast.id); toast.action!.run(); }}>{toast.action.label}</button>
      {:else if toast.persistent}
        <span class="toast-tap-hint">Tap to dismiss</span>
      {:else}
        <button class="toast-dismiss" onclick={() => dismissToast(toast.id)}>✕</button>
      {/if}
    </div>
  {/each}
</div>

{@render children()}

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
    --bg-alt: #d8e0e8;
    --shadow: 0 2px 16px rgba(44, 57, 71, 0.10);
    --shadow-card: 0 1px 6px rgba(44, 57, 71, 0.08);

    /* Exercise cards: outline, left stripe, and the queue's action segments */
    --card-ring: transparent;
    --card-ring-active: transparent;
    --urgency-strength: 100%;
    --exercise-stripe: #3b82f6;
    --segment-bg: transparent;
    --segment-hover: rgba(128, 128, 128, 0.1);
    --split-arrow-bg: var(--interactive);
    --phase-exercise-bg: #059669;
    --phase-exercise-hover: #047857;
    --phase-exercise-text: #fff;
    --phase-rest-bg: #2563eb;
    --phase-rest-hover: #1d4ed8;
    --phase-rest-text: #fff;
    /* Phase color as text on the card (the queue's timer and set status). */
    --phase-exercise-ink: #047857;
    --phase-rest-ink: #1d4ed8;
  }

  @media (prefers-color-scheme: dark) {
    :global(html:not([data-theme='light'])) {
      --bg: #1e1c1b;
      --text: #f2ece5;
      --card-bg: #272422;
      --card-border: #34312d;
      --interactive: #e2a758;
      --interactive-hover: #ecb76d;
      --interactive-text: #2e200d;
      --accent: #e2a758;
      --bg-alt: #171615;
      --shadow: 0 2px 20px rgba(0, 0, 0, 0.45);
      --shadow-card: 0 1px 8px rgba(0, 0, 0, 0.30);

      --card-ring: #34312d;
      --card-ring-active: #e2a758;
      --urgency-strength: 70%;
      --exercise-stripe: #e2a758;
      --segment-bg: #4a433d;
      --segment-hover: #574f48;
      --split-arrow-bg: #c88e44;
      --phase-exercise-bg: #4b3b25;
      --phase-exercise-hover: #58452c;
      --phase-exercise-text: #f6d5a5;
      --phase-rest-bg: #26343d;
      --phase-rest-hover: #2e3f4a;
      --phase-rest-text: #b9d3e6;
      --phase-exercise-ink: #f6d5a5;
      --phase-rest-ink: #b9d3e6;
    }
  }

  :global(html[data-theme='dark']) {
    --bg: #1e1c1b;
    --text: #f2ece5;
    --card-bg: #272422;
    --card-border: #34312d;
    --interactive: #e2a758;
    --interactive-hover: #ecb76d;
    --interactive-text: #2e200d;
    --accent: #e2a758;
    --bg-alt: #171615;
    --shadow: 0 2px 20px rgba(0, 0, 0, 0.45);
    --shadow-card: 0 1px 8px rgba(0, 0, 0, 0.30);

    --card-ring: #34312d;
    --card-ring-active: #e2a758;
    --urgency-strength: 70%;
    --exercise-stripe: #e2a758;
    --segment-bg: #4a433d;
    --segment-hover: #574f48;
    --split-arrow-bg: #c88e44;
    --phase-exercise-bg: #4b3b25;
    --phase-exercise-hover: #58452c;
    --phase-exercise-text: #f6d5a5;
    --phase-rest-bg: #26343d;
    --phase-rest-hover: #2e3f4a;
    --phase-rest-text: #b9d3e6;
    --phase-exercise-ink: #f6d5a5;
    --phase-rest-ink: #b9d3e6;
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
  :global(input[type='password']),
  :global(input[type='email']),
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
  :global(input[type='password']:focus),
  :global(input[type='email']:focus),
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

  /* Top bar of a full-screen overlay (About, share, import, QR scan): a clear
     Back button that stays put while the content scrolls. */
  :global(.sheet-bar) {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    padding: 0.6rem 1rem;
    background: color-mix(in srgb, var(--bg) 92%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--card-border);
  }

  :global(.sheet-back) {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1.1rem 0.55rem 0.8rem;
    font-weight: 500;
  }

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

  :global(.btn-outline) {
    background: none;
    border: 1px solid rgba(128, 128, 128, 0.35);
    color: inherit;
  }

  :global(.btn-outline:hover) { background: rgba(128, 128, 128, 0.1); }

  :global(.empty) {
    text-align: center;
    opacity: 0.45;
    margin-top: 4rem;
    font-size: 0.95rem;
  }

  /* ── Login forms (the auth modal and the email-link pages) ── */
  :global(.auth-card h1),
  :global(.auth-card h2) { margin: 0 2rem 0.35rem 0; font-size: 1.3rem; }
  :global(.auth-card .auth-lead) { margin: 0 0 1.25rem; font-size: 0.88rem; opacity: 0.65; }

  :global(.auth-card form) { display: flex; flex-direction: column; gap: 1rem; }

  :global(.auth-card .field) { display: flex; flex-direction: column; gap: 0.35rem; }
  :global(.auth-card .field label) { font-size: 0.88rem; font-weight: 500; }
  :global(.auth-card .field input) { width: 100%; font-size: 1rem; }
  :global(.auth-card .field-hint) { margin: 0; font-size: 0.78rem; opacity: 0.6; }
  :global(.auth-card .optional) { font-weight: 400; opacity: 0.55; }

  :global(.auth-card .auth-error) {
    margin: 0;
    font-size: 0.85rem;
    color: #ef4444;
  }

  :global(.auth-card .auth-notice) {
    margin: 0;
    font-size: 0.85rem;
    padding: 0.7rem 0.85rem;
    border-radius: 10px;
    background: rgba(128, 128, 128, 0.1);
  }

  :global(.auth-card .auth-notice.success) { background: rgba(34, 197, 94, 0.12); }

  :global(.auth-card .auth-links) {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.1rem;
    font-size: 0.85rem;
  }

  :global(.auth-card .auth-links a),
  :global(.auth-card a.inline) { color: var(--accent); }

  :global(.auth-card .btn-link) {
    background: none;
    border: none;
    padding: 0;
    color: var(--accent);
    font-size: 0.85rem;
    font-weight: 500;
    cursor: pointer;
  }

  :global(.auth-card .btn-link:hover) { background: none; text-decoration: underline; }

  :global(.auth-card button[type='submit']) { padding: 0.65rem 1rem; font-size: 0.95rem; }

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

  .toast-action {
    margin-left: auto;
    flex-shrink: 0;
    padding: 0.3rem 0.75rem;
    font-size: 0.8rem;
  }
</style>
