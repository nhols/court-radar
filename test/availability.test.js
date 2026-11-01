import test from "node:test";
import assert from "node:assert/strict";
import {
  CACHE_MS,
  getVenueAvailability,
  hedged,
  handleAvailabilityRequest,
  layeredCache,
  memoryCache,
  validateRequest
} from "../lib/availability.mjs";
import { addDays, londonToday } from "../public/shared/dates.js";

const DATE = addDays(londonToday(), 1);

function ltaResponse(slots = 1) {
  return {
    ok: true,
    json: async () => ({
      venueDetails: [{
        id: "court-1",
        name: "Court 1",
        surface: "Hard",
        availableSlots: Array.from({ length: slots }, (_, index) => ({
          startTime: `${DATE}T${String(9 + index).padStart(2, "0")}:00:00`,
          endTime: `${DATE}T${String(10 + index).padStart(2, "0")}:00:00`,
          price: 10
        }))
      }],
      rules: { outsideBookingWindow: false, availableDates: [DATE] },
      error: { hasError: false }
    })
  };
}

function fakeFetch(respond) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(String(url));
    return respond(calls.length);
  };
  return { fetch, calls };
}

test("validateRequest rejects unknown venues, browser venues and bad dates", () => {
  assert.match(validateRequest("NOPE", DATE), /Unknown venue/);
  assert.match(validateRequest("FR", DATE), /browser/);
  assert.match(validateRequest("CC", "2026-02-31"), /valid date/);
  assert.match(validateRequest("CC", addDays(londonToday(), -1)), /passed/);
  assert.equal(validateRequest("CC", DATE), null);
});

test("only the requested venue is fetched", async () => {
  const { fetch, calls } = fakeFetch(() => ltaResponse());
  const result = await getVenueAvailability("BP", DATE, { fetch, cache: memoryCache() });
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /venueid=03a2d315-2b9a-411d-8891-1bfde4cb4cf3/);
  assert.equal(result.data.venue, "BP");
  assert.equal(result.data.slots.length, 1);
});

test("answers are shared for a minute, then fetched again", async () => {
  let now = 1_000_000;
  const cache = memoryCache();
  const { fetch, calls } = fakeFetch((count) => ltaResponse(count));

  const first = await getVenueAvailability("CC", DATE, { fetch, cache, now: () => now });
  now += CACHE_MS - 1;
  const second = await getVenueAvailability("CC", DATE, { fetch, cache, now: () => now });
  assert.equal(calls.length, 1);
  assert.equal(second.cacheStatus, "hit");
  assert.deepEqual(second.data, first.data);

  now += 2;
  const third = await getVenueAvailability("CC", DATE, { fetch, cache, now: () => now });
  assert.equal(calls.length, 2);
  assert.equal(third.cacheStatus, "miss");
  assert.equal(third.data.slots.length, 2);
});

test("simultaneous requests for the same venue share one upstream call", async () => {
  const { fetch, calls } = fakeFetch(() => ltaResponse());
  const cache = memoryCache();
  await Promise.all([
    getVenueAvailability("SV", DATE, { fetch, cache }),
    getVenueAvailability("SV", DATE, { fetch, cache }),
    getVenueAvailability("SV", DATE, { fetch, cache })
  ]);
  assert.equal(calls.length, 1);
});

test("an answer over a minute old is never served, even when the booking system fails", async () => {
  let now = 5_000_000;
  const cache = memoryCache();
  const { fetch } = fakeFetch((count) => {
    if (count > 1) throw new Error("LTA is down");
    return ltaResponse();
  });

  await getVenueAvailability("BL", DATE, { fetch, cache, now: () => now });
  now += CACHE_MS;
  const failed = await getVenueAvailability("BL", DATE, { fetch, cache, now: () => now });
  assert.equal(failed.status, 502);
  assert.match(failed.data.error, /LTA is down/);
  assert.equal(failed.data.slots, undefined);
});

test("layeredCache reads the first layer that has an entry and writes to all", async () => {
  const near = memoryCache();
  const far = memoryCache();
  const cache = layeredCache(near, far);
  await far.put("key", { storedAt: 1, data: "far" });
  assert.deepEqual(await cache.get("key"), { storedAt: 1, data: "far" });
  await cache.put("other", { storedAt: 2, data: "both" });
  assert.deepEqual(await near.get("other"), { storedAt: 2, data: "both" });
  assert.deepEqual(await far.get("other"), { storedAt: 2, data: "both" });
});

test("handleAvailabilityRequest returns JSON that browsers don't cache", async () => {
  const { fetch } = fakeFetch(() => ltaResponse());
  const url = new URL(`http://localhost/api/availability?venue=BPK&date=${DATE}`);
  const result = await handleAvailabilityRequest(url, { fetch, cache: memoryCache() });
  assert.equal(result.status, 200);
  assert.equal(result.headers["cache-control"], "no-store");
  assert.equal(result.body.venue, "BPK");

  const bad = await handleAvailabilityRequest(new URL("http://localhost/api/availability?venue=FR&date=x"));
  assert.equal(bad.status, 400);
});

test("a slow request is hedged with a second one, and the first answer wins", async () => {
  const started = [];
  const result = await hedged((signal) => {
    const index = started.push(signal);
    return new Promise((resolve) => setTimeout(() => resolve(index), index === 1 ? 200 : 10));
  }, 20);
  assert.equal(result, 2);
  assert.equal(started.length, 2);
  assert.equal(started[0].aborted, true, "the slow request is cancelled");
});

test("a failed request is retried once before giving up", async () => {
  let calls = 0;
  await assert.rejects(hedged(async () => {
    calls += 1;
    throw new Error(`failure ${calls}`);
  }, 1000), /failure 2/);
  assert.equal(calls, 2);
});
