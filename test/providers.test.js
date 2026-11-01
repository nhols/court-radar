import test from "node:test";
import assert from "node:assert/strict";
import { venueByCode, VENUES, DEFAULT_VENUE_CODES, SOURCES } from "../public/shared/venues.js";
import {
  allStarAccess,
  allStarPrice,
  decodeHtml,
  mindbodyEndpoint,
  normalizeMindbody,
  parseJsonp,
  parseWidgetHtml
} from "../public/shared/mindbody.js";
import { ltaEndpoint, normalizeLta } from "../public/shared/lta.js";
import { addDays, daysBetween, isValidDate, toTime } from "../public/shared/dates.js";

const TODAY = "2026-06-22";
const HTML = `
  <div class="healcode-trainer">
    <div class="trainer-label location-_6 trainer-100000025">
      <a href="">Court 1 FR</a>
    </div>
    <span class="appointment pill-button">
      <a data-url="https://example.test/book?a=1&amp;b=2" class="hc-button filterable">07:00</a>
    </span>
    <span class="appointment pill-button">
      <a data-url="https://example.test/book?time=17" class="hc-button filterable">17:00</a>
    </span>
  </div>
`;

test("every venue has a unique code, a known source and coordinates", () => {
  assert.equal(new Set(VENUES.map((venue) => venue.code)).size, VENUES.length);
  for (const venue of VENUES) {
    assert.ok(SOURCES[venue.source], `${venue.code} has a known source`);
    assert.ok(Number.isFinite(venue.lat) && Number.isFinite(venue.lng), `${venue.code} has coordinates`);
  }
  assert.deepEqual(DEFAULT_VENUE_CODES, []);
  assert.ok(VENUES.length > 30, "LTA venues found by the finder script are all listed");
  assert.equal(venueByCode("BPK").name, "Battersea Park");
});

test("dates are handled as London calendar days", () => {
  assert.equal(isValidDate("2026-06-21"), true);
  assert.equal(isValidDate("2026-02-31"), false);
  assert.equal(isValidDate("21/06/2026"), false);
  assert.equal(addDays("2026-10-24", 2), "2026-10-26");
  assert.equal(daysBetween("2026-10-24", "2026-10-26"), 2);
  assert.equal(toTime(450), "07:30");
});

test("parseJsonp and parseWidgetHtml read Mindbody's widget", () => {
  assert.deepEqual(parseJsonp('({"contents":"hello"});'), { contents: "hello" });
  assert.equal(decodeHtml("Leader&#39;s &amp; Courts"), "Leader's & Courts");
  assert.deepEqual(parseWidgetHtml(HTML)[0], {
    courtId: "100000025",
    court: "Court 1 FR",
    time: "07:00",
    bookingUrl: "https://example.test/book?a=1&b=2"
  });
});

test("All Star booking tiers follow the 2 and 14 day windows", () => {
  assert.equal(allStarAccess("2026-06-21", TODAY), "past");
  assert.equal(allStarAccess("2026-06-24", TODAY), "public");
  assert.equal(allStarAccess("2026-06-25", TODAY), "member");
  assert.equal(allStarAccess("2026-07-06", TODAY), "member");
  assert.equal(allStarAccess("2026-07-07", TODAY), "outside");
});

test("mindbodyEndpoint switches to the Member Plus widget beyond two days", () => {
  const venue = venueByCode("FR");
  const publicUrl = new URL(mindbodyEndpoint(venue, "2026-06-23", TODAY));
  assert.equal(publicUrl.hostname, "widgets.mindbodyonline.com");
  assert.equal(publicUrl.searchParams.get("options[session_type_ids]"), "2233");
  assert.equal(publicUrl.searchParams.get("options[location_id]"), "6");
  const memberUrl = new URL(mindbodyEndpoint(venue, "2026-06-30", TODAY));
  assert.equal(memberUrl.searchParams.get("options[session_type_ids]"), "2230");
  assert.notEqual(memberUrl.pathname, publicUrl.pathname);
});

test("allStarPrice applies published public and Member Plus bands", () => {
  assert.deepEqual(allStarPrice(venueByCode("FR"), "2026-06-22", "09:00"), {
    price: 8.5,
    memberPrice: 6.5,
    period: "off-peak",
    note: undefined
  });
  assert.equal(allStarPrice(venueByCode("WC"), "2026-06-22", "17:00").price, 16);
  assert.match(allStarPrice(venueByCode("KGP"), "2026-06-21", "18:00").note, /£23/);
});

test("normalizeMindbody keeps every court and prices each slot", () => {
  const result = normalizeMindbody({ contents: HTML }, venueByCode("FR"), "2026-06-23", TODAY);
  assert.equal(result.status, "live");
  assert.equal(result.courts.length, 2);
  assert.deepEqual(result.slots.map((slot) => [slot.time, slot.price, slot.memberOnly]), [
    ["07:00", 8.5, false],
    ["17:00", 10.5, false]
  ]);
  const ahead = normalizeMindbody({ contents: HTML }, venueByCode("FR"), "2026-06-30", TODAY);
  assert.equal(ahead.slots.every((slot) => slot.memberOnly), true);
  assert.match(ahead.note, /Member Plus/);
});

const LTA_PAYLOAD = {
  venueDetails: [
    {
      id: "court-2",
      name: "Court 2",
      order: 2,
      surface: "Artificial Grass",
      availableSlots: []
    },
    {
      id: "court-1",
      name: "Court 1",
      order: 1,
      surface: "Tarmac",
      availableSlots: [{ startTime: "2026-06-23T18:00:00", endTime: "2026-06-23T19:00:00", price: 12.5 }]
    }
  ],
  rules: { outsideBookingWindow: false, availableDates: ["2026-06-22", "2026-06-23", "2026-06-24"] },
  error: { hasError: false }
};

test("ltaEndpoint asks for one venue on one date", () => {
  const url = new URL(ltaEndpoint(venueByCode("CC"), "2026-06-23"));
  assert.equal(url.hostname, "www.lta.org.uk");
  assert.equal(url.searchParams.get("venueid"), "2fb20762-62d1-4fc7-961c-f4404d4d1ae8");
  assert.equal(url.searchParams.get("date"), "2026-06-23");
});

test("normalizeLta orders courts, names surfaces and links to the booking page", () => {
  const result = normalizeLta(LTA_PAYLOAD, venueByCode("CC"), "2026-06-23", TODAY);
  assert.equal(result.status, "live");
  assert.deepEqual(result.courts.map((court) => [court.name, court.surface]), [
    ["Court 1", "hard"],
    ["Court 2", "artificial grass"]
  ]);
  assert.deepEqual(result.slots[0], {
    courtId: "court-1",
    time: "18:00",
    endTime: "19:00",
    price: 12.5,
    bookingUrl: "https://www.lta.org.uk/play/book-a-tennis-court/courts/clapham-common_2fb20762-62d1-4fc7-961c-f4404d4d1ae8/?date=2026-06-23"
  });
  const battersea = normalizeLta(LTA_PAYLOAD, venueByCode("BPK"), "2026-06-23", TODAY);
  assert.match(battersea.slots[0].bookingUrl, /clubspark\.lta\.org\.uk.*#\?date=2026-06-23&role=guest$/);
});

test("normalizeLta says when a date opens for booking", () => {
  const result = normalizeLta({
    venueDetails: [],
    rules: { outsideBookingWindow: true, availableDates: ["2026-06-22", "2026-06-23"] },
    error: { hasError: false }
  }, venueByCode("BPK"), "2026-06-26", TODAY);
  assert.equal(result.status, "outside-window");
  assert.equal(result.bookableFrom, "2026-06-25");
});

test("normalizeLta marks dates the venue doesn't take online bookings for", () => {
  const result = normalizeLta({
    venueDetails: [],
    rules: { outsideBookingWindow: false, availableDates: ["2026-06-23", "2026-06-24"] },
    error: { hasError: false }
  }, venueByCode("SC"), TODAY, TODAY);
  assert.equal(result.status, "closed");
});

test("normalizeLta reports venues without public availability as errors", () => {
  assert.throws(
    () => normalizeLta({ venueDetails: null, rules: null, error: { hasError: true, errorMessage: "" } }, venueByCode("WIM"), TODAY),
    /no public availability/
  );
});

test("normalizeLta leaves out padel and pickleball courts", () => {
  const result = normalizeLta({
    venueDetails: [
      { id: "t1", name: "Tennis 1 (lit 5pm>)", order: 1, surface: "Hard", availableSlots: [] },
      { id: "p1", name: "Padel (lit 5pm>)", order: 2, surface: "Other", availableSlots: [] }
    ],
    rules: { outsideBookingWindow: false, availableDates: [TODAY] },
    error: { hasError: false }
  }, venueByCode("BE"), TODAY, TODAY);
  assert.deepEqual(result.courts.map((court) => court.id), ["t1"]);
});
