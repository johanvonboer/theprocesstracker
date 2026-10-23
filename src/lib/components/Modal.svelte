<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { X } from 'lucide-svelte';

  // A generic widget, so it takes props. `sheet` fills the screen instead of
  // being a centered card.
  //
  // Deliberately not a native showModal() <dialog>: that makes everything
  // outside it inert and sits in the top layer above any z-index, which buries
  // the popups password managers inject into the page (Dashlane's generator,
  // autofill menus). Instead the page shell makes only the app's own <main>
  // inert while an overlay is open, and this handles Escape and focus itself.
  let { label, onclose, sheet = false, children }: {
    label: string;
    onclose: () => void;
    sheet?: boolean;
    children: Snippet;
  } = $props();

  let panel: HTMLDivElement;
  // A press that starts inside the panel and ends on the backdrop (selecting
  // text in an input, say) still fires a click there — only a press that
  // starts on the backdrop closes it.
  let pressedBackdrop = false;

  onMount(() => {
    const returnFocus = document.activeElement as HTMLElement | null;
    panel.focus({ preventScroll: true });
    return () => returnFocus?.focus({ preventScroll: true });
  });

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !e.defaultPrevented) onclose();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="modal-root" class:sheet>
  <div class="modal-backdrop"></div>
  <div
    class="modal-scroller"
    role="presentation"
    onpointerdown={(e) => (pressedBackdrop = e.target === e.currentTarget)}
    onclick={(e) => { if (pressedBackdrop && e.target === e.currentTarget) onclose(); }}
  >
    <div class="modal-panel" bind:this={panel} role="dialog" aria-modal="true" aria-label={label} tabindex="-1">
      <button class="btn-icon btn-ghost modal-close" onclick={onclose} aria-label="Close"><X size={20} /></button>
      {@render children()}
    </div>
  </div>
</div>

<style>
  :global(html:has(.modal-root)) { overflow: hidden; }

  /* Above the app, below toasts (100) and the QR scanner (200). */
  .modal-root { position: fixed; inset: 0; z-index: 50; }

  /* A separate layer: backdrop-filter on an ancestor would become the
     containing block for the QR scanner's position: fixed. */
  .modal-backdrop {
    position: absolute;
    inset: 0;
    background: rgba(20, 28, 36, 0.55);
    backdrop-filter: blur(2px);
    animation: fade-in 180ms ease-out;
  }

  .modal-scroller {
    position: absolute;
    inset: 0;
    display: flex;
    padding: 1rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .modal-panel {
    position: relative;
    margin: auto;
    width: min(420px, 100%);
    padding: 1.5rem 1.25rem 1.25rem;
    border: 1px solid var(--card-border);
    border-radius: 16px;
    background: var(--card-bg);
    color: var(--text);
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.3);
    outline: none;
    animation: modal-in 180ms ease-out;
  }

  .sheet .modal-scroller { padding: 0; }

  .sheet .modal-panel {
    width: 100%;
    min-height: 100%;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: var(--bg);
    box-shadow: none;
  }

  .modal-close { position: absolute; top: 0.75rem; right: 0.75rem; z-index: 2; }
  .sheet .modal-close { position: fixed; top: 0.6rem; right: 0.75rem; opacity: 0.7; }

  @keyframes modal-in {
    from { opacity: 0; transform: translateY(12px); }
  }

  @keyframes fade-in {
    from { opacity: 0; }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal-backdrop, .modal-panel { animation: none; }
  }
</style>
