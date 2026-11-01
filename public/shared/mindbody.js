// All Star Tennis books through Mindbody's appointment widget. The widget
// returns JSONP wrapping an HTML fragment, one block per court ("trainer").

import { daysBetween, dayOfWeek, hourOf } from "./dates.js";

export const MINDBODY_BASE = "https://widgets.mindbodyonline.com/widgets/appointments";
const PUBLIC_WIDGET = "ce84117c767";
const MEMBER_WIDGET = "ce84234c767";
export const PUBLIC_DAYS = 2;
export const MEMBER_DAYS = 14;

export function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function parseJsonp(text) {
  const trimmed = text.trim();
  const json = trimmed.startsWith("(") && trimmed.endsWith(");")
    ? trimmed.slice(1, -2)
    : trimmed;
  return JSON.parse(json);
}

export function parseWidgetHtml(html) {
  const results = [];
  const courtBlocks = html.split('<div class="healcode-trainer">').slice(1);

  for (const block of courtBlocks) {
    const heading = block.match(/trainer-(\d+)[^"]*"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/);
    if (!heading) continue;
    const [, courtId, rawCourtName] = heading;
    const slotPattern = /<a[^>]*data-url="([^"]+)"[^>]*class="hc-button filterable"[^>]*>(\d{2}:\d{2})<\/a>/g;
    let slotMatch;

    while ((slotMatch = slotPattern.exec(block))) {
      results.push({
        courtId,
        court: decodeHtml(rawCourtName),
        time: slotMatch[2],
        bookingUrl: decodeHtml(slotMatch[1])
      });
    }
  }

  return results;
}

// Which tier of All Star booking a date falls into, counted from today.
export function allStarAccess(date, today) {
  const ahead = daysBetween(today, date);
  if (ahead < 0) return "past";
  if (ahead <= PUBLIC_DAYS) return "public";
  if (ahead <= MEMBER_DAYS) return "member";
  return "outside";
}

export function allStarPrice(venue, date, time) {
  const day = dayOfWeek(date);
  const peak = day === 0 || day === 6 || hourOf(time) >= 16;
  const { offPeak, peak: peakPrice, memberOffPeak, memberPeak } = venue.prices;
  return {
    price: peak ? peakPrice : offPeak,
    memberPrice: peak ? memberPeak : memberOffPeak,
    period: peak ? "peak" : "off-peak",
    note: peak ? venue.pricingNote : undefined
  };
}

export function mindbodyEndpoint(venue, date, today) {
  const member = allStarAccess(date, today) === "member";
  const params = new URLSearchParams({
    "options[session_type_ids]": member ? venue.mindbody.memberSession : venue.mindbody.publicSession,
    "options[start_date]": date,
    "options[end_date]": date,
    "options[location_id]": venue.mindbody.locationId,
    "options[staff_ids][]": ""
  });
  return `${MINDBODY_BASE}/${member ? MEMBER_WIDGET : PUBLIC_WIDGET}/results.json?${params}`;
}

export function normalizeMindbody(payload, venue, date, today) {
  const memberOnly = allStarAccess(date, today) === "member";
  const knownCourts = new Set(venue.courts.map((court) => court.id));
  const slots = parseWidgetHtml(payload.contents || "")
    .filter((slot) => knownCourts.has(slot.courtId))
    .map((slot) => ({
      courtId: slot.courtId,
      time: slot.time,
      bookingUrl: slot.bookingUrl,
      memberOnly,
      ...allStarPrice(venue, date, slot.time)
    }));

  return {
    venue: venue.code,
    date,
    status: "live",
    note: memberOnly ? "Only Member Plus customers can book this far ahead" : undefined,
    courts: venue.courts,
    slots
  };
}
