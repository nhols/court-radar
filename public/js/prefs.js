// What the viewer has chosen, and how it survives a reload. The URL carries
// the full view so links can be shared; localStorage remembers every choice the
// viewer makes between visits. A URL value wins over a stored one.

import { VENUES, DEFAULT_VENUE_CODES, venueByCode } from "../shared/venues.js";
import { addDays, daysBetween, isValidDate, londonHour, londonToday } from "../shared/dates.js";

export const STORAGE_KEY = "court-radar:prefs:v1";
export const FIRST_HOUR = 6;
export const LAST_HOUR = 22;
export const DATE_RANGE_DAYS = 14;
const MATCHES = ["all", "any"];
const VIEWS = ["grid", "map"];
const SORTS = ["default", "free", "near"];

export const DEFAULTS = Object.freeze({
  hours: [],
  match: "all",
  hideFull: true,
  surface: "any",
  view: "grid",
  sort: "default"
});

const knownCode = (code) => Boolean(venueByCode(code));
const validHour = (hour) => Number.isInteger(hour) && hour >= FIRST_HOUR && hour <= LAST_HOUR;
const validSurface = (surface) => typeof surface === "string" && /^[a-z ]{2,24}$/.test(surface);

export function defaultDate(now = new Date()) {
  const today = londonToday(now);
  return londonHour(now) >= 20 ? addDays(today, 1) : today;
}

export function isSelectableDate(date, today) {
  if (!isValidDate(date)) return false;
  const ahead = daysBetween(today, date);
  return ahead >= 0 && ahead <= DATE_RANGE_DAYS;
}

function parseHours(values) {
  return [...new Set((values || []).map(Number).filter(validHour))].sort((a, b) => a - b);
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

export function readStored(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return {};
    const stored = JSON.parse(raw);
    return {
      date: typeof stored.date === "string" ? stored.date : undefined,
      venues: Array.isArray(stored.venues) ? new Set(stored.venues.filter(knownCode)) : undefined,
      hours: Array.isArray(stored.hours) ? parseHours(stored.hours) : undefined,
      match: MATCHES.includes(stored.match) ? stored.match : undefined,
      hideFull: typeof stored.hideFull === "boolean" ? stored.hideFull : undefined,
      surface: validSurface(stored.surface) ? stored.surface : undefined,
      view: VIEWS.includes(stored.view) ? stored.view : undefined,
      sort: SORTS.includes(stored.sort) ? stored.sort : undefined,
      collapsed: Array.isArray(stored.collapsed) ? stored.collapsed.filter(knownCode) : undefined
    };
  } catch {
    return {};
  }
}

export function writeStored(storage, state) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify({
      date: state.date,
      venues: VENUES.filter((venue) => state.venues.has(venue.code)).map((venue) => venue.code),
      hours: [...state.hours],
      match: state.match,
      hideFull: state.hideFull,
      surface: state.surface,
      view: state.view,
      sort: state.sort,
      collapsed: [...state.collapsed]
    }));
  } catch {
    // Private windows and blocked storage simply don't remember anything.
  }
}

export function parseSearch(search) {
  const params = new URLSearchParams(search);
  const list = (key) => params.get(key)?.split(",").map((item) => item.trim()).filter(Boolean);
  const parsed = {};
  if (params.has("date")) parsed.date = params.get("date");
  if (params.has("v")) parsed.venues = new Set(list("v").map((code) => code.toUpperCase()).filter(knownCode));
  if (params.has("h")) parsed.hours = parseHours(list("h"));
  if (params.has("match")) parsed.match = pick(params.get("match"), MATCHES, undefined);
  if (params.has("full")) parsed.hideFull = params.get("full") !== "show";
  if (params.has("surface") && validSurface(params.get("surface"))) parsed.surface = params.get("surface");
  if (params.has("view")) parsed.view = pick(params.get("view"), VIEWS, undefined);
  if (params.has("sort")) parsed.sort = pick(params.get("sort"), SORTS, undefined);
  return Object.fromEntries(Object.entries(parsed).filter(([, value]) => value !== undefined));
}

// Values equal to the defaults are left out so everyday URLs stay short.
export function buildSearch(state, { date } = {}) {
  const params = new URLSearchParams();
  if (state.date !== date) params.set("date", state.date);
  if (state.venues.size) {
    params.set("v", VENUES.filter((venue) => state.venues.has(venue.code)).map((venue) => venue.code).join(","));
  }
  if (state.hours.size) params.set("h", [...state.hours].sort((a, b) => a - b).join(","));
  if (state.match !== DEFAULTS.match) params.set("match", state.match);
  if (state.hideFull !== DEFAULTS.hideFull) params.set("full", "show");
  if (state.surface !== DEFAULTS.surface) params.set("surface", state.surface);
  if (state.view !== DEFAULTS.view) params.set("view", state.view);
  if (state.sort !== DEFAULTS.sort) params.set("sort", state.sort);
  const search = params.toString().replaceAll("%2C", ",");
  return search ? `?${search}` : "";
}

export function initialState({ search = "", storage, now = new Date() } = {}) {
  const today = londonToday(now);
  const fromUrl = parseSearch(search);
  const stored = readStored(storage);
  const value = (key) => fromUrl[key] ?? stored[key] ?? DEFAULTS[key];

  return {
    date: [fromUrl.date, stored.date].find((date) => isSelectableDate(date, today)) || defaultDate(now),
    venues: new Set(fromUrl.venues ?? stored.venues ?? DEFAULT_VENUE_CODES),
    hours: new Set(value("hours")),
    match: value("match"),
    hideFull: value("hideFull"),
    surface: value("surface"),
    view: value("view"),
    sort: value("sort"),
    collapsed: new Set(stored.collapsed || [])
  };
}
