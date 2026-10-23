import { goto, pushState, replaceState } from '$app/navigation';
import { page } from '$app/state';

/** Chrome's install-prompt event (not yet in TypeScript's DOM types). */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Cross-route UI hand-offs. Ephemeral — never persisted.
 */
export const ui = $state({
  /** Set by the /s/<code> route; the schema bar opens the import preview for it. */
  pendingShareCode: null as string | null,
  /** Set by the /link route (a login QR code opened by a phone camera); the login form redeems it. */
  pendingLoginLink: null as string | null,
  /** Present when the browser will let us offer "Install app". */
  installPrompt: null as BeforeInstallPromptEvent | null,
});

export async function installApp() {
  const prompt = ui.installPrompt;
  if (!prompt) return;
  ui.installPrompt = null; // each event can only be prompted once
  await prompt.prompt();
}

// ── Overlays ──────────────────────────────────────────────────────
// The About sheet and the login forms open over the app. Which one is open
// lives in shallow-routing history state rather than in `ui`, so the browser's
// back button — Android's back gesture — closes it like a page.

export const OVERLAYS = ['about', 'login', 'register', 'forgot-password', 'link-device'] as const;
export type Overlay = (typeof OVERLAYS)[number];

export function currentOverlay(): Overlay | null {
  return page.state.overlay ?? null;
}

export function openOverlay(overlay: Overlay) {
  pushState('', { overlay });
}

/** Swap the open overlay (log in ↔ register) without adding a history entry. */
export function switchOverlay(overlay: Overlay) {
  replaceState('', { overlay });
}

export function closeOverlay() {
  // Every overlay was opened with pushState, so going back is closing it.
  if (page.state.overlay) history.back();
}

/** For /login and friends: show the app with that overlay open over it. */
export async function showAppWithOverlay(overlay: Overlay) {
  await goto('/', { replaceState: true });
  openOverlay(overlay);
}
