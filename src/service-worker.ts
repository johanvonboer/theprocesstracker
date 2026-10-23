/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

// Keeps the app openable without a connection. Everything the app needs is
// precached at install time, per build; data lives in localStorage and the
// API is never cached, so the network is only ever needed for syncing.
import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `app-${version}`;
/** The SPA shell (index.html). Every route renders from it. */
const SHELL = '/';
const ASSETS = [SHELL, ...build, ...files];

sw.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  );
});

// The page asks for this when the user accepts the "new version" prompt.
sw.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') sw.skipWaiting();
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // API calls (another origin) always go to the network.
  if (url.origin !== sw.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Navigations get the cached shell, so /login or /s/<code> open offline
    // too, and the HTML always matches the cached build it references.
    const cached = await cache.match(request.mode === 'navigate' ? SHELL : request);
    return cached ?? fetch(request);
  })());
});
