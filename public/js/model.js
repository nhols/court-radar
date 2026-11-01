// Turns loaded results and the viewer's filters into what the grid shows.
// Pure functions only, so the rules can be tested without a browser.

import { VENUES } from "../shared/venues.js";
import { hourOf } from "../shared/dates.js";

const MIN_HOUR = 7;
const MAX_HOUR = 21;

export function distanceKm(a, b) {
  const rad = (degrees) => degrees * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

// Courts free at every selected hour ("all"), or at any of them ("any").
// With no hours selected, courts with any free hour.
export function courtsMatchingHours(courts, slotsByCourt, hours, match = "all") {
  if (!hours.size) return courts.filter((court) => slotsByCourt.get(court.id)?.size);
  return courts.filter((court) => {
    const free = slotsByCourt.get(court.id);
    if (!free) return false;
    const test = (hour) => free.has(hour);
    return match === "any" ? [...hours].some(test) : [...hours].every(test);
  });
}

export function hourColumns(results) {
  let first = MIN_HOUR;
  let last = MAX_HOUR;
  for (const result of results) {
    for (const slot of result?.slots || []) {
      const hour = hourOf(slot.time);
      first = Math.min(first, hour);
      last = Math.max(last, hour);
    }
  }
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function buildGrid({
  selected,
  results,
  surface = "any",
  hours = new Set(),
  match = "all",
  hideFull = true,
  sort = "default",
  position = null,
  pastBefore = -1
}) {
  const selectedResults = [...selected].map((code) => results.get(code)).filter(Boolean);
  const columns = hourColumns(selectedResults);
  const sections = [];
  const nothingMatches = [];

  for (const venue of VENUES) {
    if (!selected.has(venue.code)) continue;
    const result = results.get(venue.code) || { status: "loading" };
    const section = {
      venue,
      result,
      status: result.status,
      courts: [],
      free: 0,
      distance: position ? distanceKm(position, venue) : null
    };

    if (result.status === "live") {
      const slotsByCourt = new Map();
      for (const slot of result.slots) {
        const hour = hourOf(slot.time);
        if (hour < pastBefore) continue;
        if (!slotsByCourt.has(slot.courtId)) slotsByCourt.set(slot.courtId, new Map());
        const courtSlots = slotsByCourt.get(slot.courtId);
        if (!courtSlots.has(hour)) courtSlots.set(hour, slot);
      }

      const surfaceCourts = result.courts.filter((court) => surface === "any" || court.surface === surface);
      const courts = hideFull ? courtsMatchingHours(surfaceCourts, slotsByCourt, hours, match) : surfaceCourts;
      if (!courts.length && (hideFull || surface !== "any")) {
        nothingMatches.push(venue);
        continue;
      }

      section.courts = courts.map((court) => ({ court, slots: slotsByCourt.get(court.id) || new Map() }));
      const counts = (row) => [...row.slots.keys()].filter((hour) => !hours.size || hours.has(hour)).length;
      section.free = section.courts.reduce((sum, row) => sum + counts(row), 0);
      section.freeCourts = section.courts.filter((row) => counts(row) > 0).length;
    }

    sections.push(section);
  }

  const order = (section) => section.status === "live" ? 0 : section.status === "loading" ? 1 : 2;
  if (sort === "free") {
    sections.sort((a, b) => order(a) - order(b) || b.free - a.free);
  } else if (sort === "near" && position) {
    sections.sort((a, b) => a.distance - b.distance);
  }

  const live = sections.filter((section) => section.status === "live");

  return {
    columns,
    sections,
    nothingMatches,
    totals: {
      slots: live.reduce((sum, section) => sum + section.free, 0),
      courts: live.reduce((sum, section) => sum + (section.freeCourts || 0), 0),
      loading: sections.filter((section) => section.status === "loading").length
    }
  };
}

export function surfacesIn(results, selected) {
  const surfaces = new Set();
  for (const code of selected) {
    for (const court of results.get(code)?.courts || []) surfaces.add(court.surface);
  }
  const order = ["hard", "carpet", "artificial grass", "clay", "grass"];
  return [...surfaces].sort((a, b) =>
    (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99) || a.localeCompare(b));
}

export function hoursLabel(hours) {
  const sorted = [...hours].sort((a, b) => a - b);
  if (!sorted.length) return "Any time";
  const contiguous = sorted.every((hour, index) => index === 0 || hour === sorted[index - 1] + 1);
  const pad = (hour) => `${String(hour).padStart(2, "0")}:00`;
  if (contiguous) return `${pad(sorted[0])}–${pad(sorted.at(-1) + 1)}`;
  return sorted.length <= 3 ? sorted.map(pad).join(", ") : `${sorted.length} hours`;
}
