// Plain JS (not TS) because src/params.js imports it, and SvelteKit loads that
// file directly in Node during the build.

/** The overlays that open over the app, addressable as /<overlay>. */
export const OVERLAYS = /** @type {const} */ (['about', 'login', 'register', 'forgot-password', 'link-device']);
