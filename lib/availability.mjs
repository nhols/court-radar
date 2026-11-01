// Server-side availability for one venue on one date, shared by the Cloudflare
// Pages Function and the local Node server. Answers are shared for at most a
// minute, so many visitors cost the booking systems one request per venue per
// minute. Nothing older is ever served: courts get booked quickly.

import { venueByCode, SOURCES } from "../public/shared/venues.js";
import { isValidDate, londonToday, daysBetween } from "../public/shared/dates.js";
import { ltaEndpoint, normalizeLta } from "../public/shared/lta.js";

export const CACHE_MS = 60_000;
// LTA usually answers in 2–4 seconds but now and then takes 30 or more. If
// the first request hasn't answered after HEDGE_MS, a second one goes out and
// whichever answers first wins.
const HEDGE_MS = 6_000;
const UPSTREAM_TIMEOUT_MS = 20_000;

export function hedged(task, delayMs = HEDGE_MS) {
  return new Promise((resolve, reject) => {
    const controllers = [];
    let started = 0;
    let running = 0;
    let settled = false;
    let timer;

    const launch = () => {
      if (settled || started === 2) return;
      started += 1;
      running += 1;
      const controller = new AbortController();
      controllers.push(controller);
      task(controller.signal).then((value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        controllers.forEach((other) => other.abort());
        resolve(value);
      }, (error) => {
        running -= 1;
        if (settled) return;
        if (started === 1) {
          // The first request failed before the second went out: send it now.
          clearTimeout(timer);
          launch();
        } else if (running === 0) {
          settled = true;
          reject(error);
        }
      });
    };

    launch();
    timer = setTimeout(launch, delayMs);
  });
}

const fetchers = {
  async lta(venue, date, fetchImpl) {
    try {
      return await hedged(async (signal) => {
        const response = await fetchImpl(ltaEndpoint(venue, date), {
          headers: { accept: "application/json" },
          signal: AbortSignal.any([signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)])
        });
        if (!response.ok) throw new Error(`LTA returned ${response.status}`);
        return normalizeLta(await response.json(), venue, date);
      });
    } catch (error) {
      if (error.name === "TimeoutError") throw new Error("LTA took too long to answer");
      throw error;
    }
  }
};

export function memoryCache({ limit = 1000 } = {}) {
  const entries = new Map();
  return {
    async get(key) {
      return entries.get(key);
    },
    async put(key, entry) {
      entries.delete(key);
      entries.set(key, entry);
      if (entries.size > limit) entries.delete(entries.keys().next().value);
    }
  };
}

// Reads from the first cache that has an entry and writes to all of them.
export function layeredCache(...caches) {
  return {
    async get(key) {
      for (const cache of caches) {
        const entry = await cache.get(key).catch(() => undefined);
        if (entry) return entry;
      }
      return undefined;
    },
    async put(key, entry) {
      await Promise.all(caches.map((cache) => cache.put(key, entry).catch(() => {})));
    }
  };
}

const defaultCache = memoryCache();
const inFlight = new Map();

function once(key, task) {
  if (!inFlight.has(key)) {
    inFlight.set(key, task().finally(() => inFlight.delete(key)));
  }
  return inFlight.get(key);
}

export function validateRequest(code, date, today = londonToday()) {
  const venue = venueByCode(code);
  if (!venue) return `Unknown venue "${code}".`;
  if (SOURCES[venue.source]?.fetchIn !== "server") {
    return `${venue.name} is loaded directly by the browser.`;
  }
  if (!isValidDate(date)) return "Use a valid date in YYYY-MM-DD format.";
  if (daysBetween(today, date) < 0) return "That date has already passed.";
  if (daysBetween(today, date) > 31) return "That date is too far ahead.";
  return null;
}

export async function getVenueAvailability(code, date, {
  cache = defaultCache,
  fetch: fetchImpl = globalThis.fetch,
  now = Date.now
} = {}) {
  const problem = validateRequest(code, date);
  if (problem) return { status: 400, data: { venue: code, date, error: problem } };

  const venue = venueByCode(code);
  const key = `${code}/${date}`;
  const cached = await cache.get(key);
  if (cached && now() - cached.storedAt < CACHE_MS) {
    return { status: 200, data: cached.data, cacheStatus: "hit" };
  }

  try {
    const data = await once(key, async () => {
      const result = await fetchers[venue.source](venue, date, fetchImpl);
      const fresh = { ...result, fetchedAt: new Date(now()).toISOString() };
      await cache.put(key, { storedAt: now(), data: fresh });
      return fresh;
    });
    return { status: 200, data, cacheStatus: "miss" };
  } catch (error) {
    return {
      status: 502,
      data: { venue: code, date, error: error.message || "The booking system did not answer" },
      cacheStatus: "error"
    };
  }
}

export async function handleAvailabilityRequest(url, options) {
  const result = await getVenueAvailability(
    url.searchParams.get("venue") || "",
    url.searchParams.get("date") || "",
    options
  );
  return {
    status: result.status,
    body: result.data,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(result.cacheStatus ? { "x-court-radar-cache": result.cacheStatus } : {})
    }
  };
}
