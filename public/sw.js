// Court Radar's service worker. It keeps the app itself available offline and
// quick to open, but never stores availability: that always comes live from
// the network, because courts get booked quickly.
//
// Bump VERSION when the list of app files changes.

const VERSION = "v1";
const APP_CACHE = `court-radar-app-${VERSION}`;
const LIBRARY_CACHE = "court-radar-libraries";

const APP_FILES = [
  "/",
  "/styles.css",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/icons/icon-192.png",
  "/js/main.js",
  "/js/controls.js",
  "/js/grid.js",
  "/js/html.js",
  "/js/loader.js",
  "/js/map.js",
  "/js/model.js",
  "/js/prefs.js",
  "/shared/dates.js",
  "/shared/lta-venues.js",
  "/shared/lta.js",
  "/shared/mindbody.js",
  "/shared/venues.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("court-radar-app-") && key !== APP_CACHE)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

// App files: try the network first so a deploy shows up straight away, and
// fall back to the saved copy when offline.
async function networkFirst(request) {
  const cache = await caches.open(APP_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const saved = await cache.match(request, { ignoreSearch: request.mode === "navigate" });
    if (saved) return saved;
    throw error;
  }
}

// Versioned libraries (the map library on unpkg) never change, so keep them.
async function cacheFirst(request) {
  const cache = await caches.open(LIBRARY_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Availability is never cached here.
    if (url.pathname.startsWith("/api/")) return;
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.hostname === "unpkg.com" && /@\d+\.\d+\.\d+\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
  // Everything else (booking systems, map tiles) goes straight to the network.
});
