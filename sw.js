/* sw.js - DCU Club Portal (GitHub Pages friendly)
   Cache static assets for offline use.
*/
const CACHE = "dcu-club-portal-v8";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",

  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/mobile.css",
  "./css/drawer.css",
  "./css/tablet.css",

  "./js/config.js",
  "./js/app.js",

  "./data/clubs.json",

  "./assets/brand/favicon.svg",
  "./assets/brand/icon-192.png",
  "./assets/brand/icon-512.png",
  "./assets/og.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE ? null : caches.delete(k))))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navigation: network first, fallback to cached index
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // Data: network first so updates come through
  if (url.pathname.endsWith("/data/clubs.json")) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Static: cache first
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy));
      return res;
    }))
  );
});
