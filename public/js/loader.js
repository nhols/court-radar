// Loads one venue for one date. Each venue loads on its own so the grid can
// fill in as answers arrive, and only selected venues are ever requested.
// An answer is reused only while it is under a minute old, counted from when
// the booking system gave it (the server may already have held it a while).

import { venueByCode, SOURCES } from "../shared/venues.js";
import { addDays, londonToday } from "../shared/dates.js";
import {
  MEMBER_DAYS,
  allStarAccess,
  mindbodyEndpoint,
  normalizeMindbody,
  parseJsonp
} from "../shared/mindbody.js";

export const MAX_AGE_MS = 60_000;
// Longer than the server allows LTA, so the server reports its own timeout.
const TIMEOUT_MS = 35_000;
const memo = new Map();

async function fetchMindbody(venue, date) {
  const today = londonToday();
  const access = allStarAccess(date, today);
  if (access === "outside") {
    return {
      venue: venue.code,
      date,
      status: "outside-window",
      bookableFrom: addDays(date, -MEMBER_DAYS),
      note: "Member Plus bookings open 14 days ahead",
      courts: venue.courts,
      slots: [],
      fetchedAt: new Date().toISOString()
    };
  }

  const response = await fetch(mindbodyEndpoint(venue, date, today), {
    headers: { accept: "application/javascript, application/json" },
    credentials: "omit",
    signal: AbortSignal.timeout(TIMEOUT_MS)
  });
  if (!response.ok) throw new Error(`Mindbody returned ${response.status}`);
  return {
    ...normalizeMindbody(parseJsonp(await response.text()), venue, date, today),
    fetchedAt: new Date().toISOString()
  };
}

async function fetchFromServer(venue, date) {
  const params = new URLSearchParams({ venue: venue.code, date });
  const response = await fetch(`/api/availability?${params}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Court Radar returned ${response.status}`);
  return body;
}

export function loadVenue(code, date, { force = false } = {}) {
  const key = `${code}/${date}`;
  const existing = memo.get(key);
  if (!force && existing && (!existing.fetchedAt || Date.now() - existing.fetchedAt < MAX_AGE_MS)) {
    return existing.promise;
  }

  const venue = venueByCode(code);
  const task = SOURCES[venue.source].fetchIn === "browser" ? fetchMindbody : fetchFromServer;
  const promise = task(venue, date).catch((error) => ({
    venue: code,
    date,
    status: "error",
    error: error.name === "TimeoutError" ? "Took too long to answer" : error.message,
    courts: [],
    slots: []
  }));
  const entry = { promise, fetchedAt: null };
  memo.set(key, entry);
  promise.then((result) => {
    if (memo.get(key) !== entry) return;
    if (result.status === "error") memo.delete(key);
    else entry.fetchedAt = Date.parse(result.fetchedAt) || Date.now();
  });
  return promise;
}
