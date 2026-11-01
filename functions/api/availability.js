import {
  handleAvailabilityRequest,
  layeredCache,
  memoryCache,
  CACHE_MS
} from "../../lib/availability.mjs";

// Isolates are reused between requests, so a small in-memory layer saves a
// round trip to Cloudflare's cache for the busiest venues.
const isolateCache = memoryCache({ limit: 200 });

function edgeCache(origin) {
  const store = globalThis.caches?.default;
  if (!store) return memoryCache();
  const keyUrl = (key) => `${origin}/__cache/availability/${key}`;
  return {
    async get(key) {
      const response = await store.match(keyUrl(key));
      return response ? response.json() : undefined;
    },
    async put(key, entry) {
      await store.put(keyUrl(key), new Response(JSON.stringify(entry), {
        headers: {
          "content-type": "application/json",
          "cache-control": `public, max-age=${CACHE_MS / 1000}`
        }
      }));
    }
  };
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const result = await handleAvailabilityRequest(url, {
    cache: layeredCache(isolateCache, edgeCache(url.origin))
  });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: result.headers
  });
}
