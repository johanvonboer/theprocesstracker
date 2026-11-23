import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // The app is a pure SPA: adapter-static with an index.html fallback, so every
    // route (/login, /s/<code>, …) is rendered client-side.
    // See: https://svelte.dev/docs/kit/single-page-apps
    sveltekit({
      preprocess: vitePreprocess(),
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
    }),
  ],
  server: {
    port: 1420,
    strictPort: true,
  },
});
