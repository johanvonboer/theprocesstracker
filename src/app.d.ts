// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
  namespace App {
    interface PageState {
      /** The overlay open over the app (see `$lib/ui.svelte`). */
      overlay?: import('$lib/ui.svelte').Overlay;
    }
  }
}

export {};
