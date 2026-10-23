// The app is a pure SPA: adapter-static with an index.html fallback, so every
// route (/login, /s/<code>, …) is rendered client-side.
// See: https://svelte.dev/docs/kit/single-page-apps
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    // The fallback page is served for nested routes like /s/<code>, so its
    // asset URLs must be absolute — relative ones would resolve under /s/.
    paths: {
      relative: false,
    },
    // Registered by hand in +layout.svelte so the app can offer an
    // "update available" prompt, and so dev mode runs without one.
    serviceWorker: {
      register: false,
    },
  },
};

export default config;
