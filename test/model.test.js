import test from "node:test";
import assert from "node:assert/strict";
import { buildGrid, courtsMatchingHours, hourColumns, hoursLabel, surfacesIn } from "../public/js/model.js";

const courts = [
  { id: "c1", name: "Court 1", surface: "hard" },
  { id: "c2", name: "Court 2", surface: "hard" },
  { id: "c3", name: "Court 3", surface: "carpet" }
];

function slot(courtId, time) {
  return { courtId, time, bookingUrl: "https://example.test" };
}

const results = new Map([
  ["CC", {
    status: "live",
    courts,
    slots: [slot("c1", "08:00"), slot("c1", "09:00"), slot("c2", "08:00"), slot("c3", "09:00")]
  }],
  ["BP", { status: "live", courts: [{ id: "b1", name: "Court 1", surface: "hard" }], slots: [slot("b1", "20:00")] }],
  ["SC", { status: "loading" }]
]);

test("courtsMatchingHours needs every hour by default, or any of them", () => {
  const free = new Map([
    ["c1", new Map([[8, {}], [9, {}]])],
    ["c2", new Map([[8, {}]])],
    ["c3", new Map([[9, {}]])]
  ]);
  assert.deepEqual(courtsMatchingHours(courts, free, new Set()), courts, "no hours: any free hour counts");
  assert.deepEqual(courtsMatchingHours(courts, free, new Set([8, 9])).map((court) => court.id), ["c1"]);
  assert.deepEqual(courtsMatchingHours(courts, free, new Set([8, 9]), "any").map((court) => court.id), ["c1", "c2", "c3"]);
});

test("hourColumns covers 07–21 and stretches for earlier or later slots", () => {
  assert.deepEqual(hourColumns([]), Array.from({ length: 15 }, (_, index) => 7 + index));
  const columns = hourColumns([{ slots: [slot("x", "06:00"), slot("x", "22:00")] }]);
  assert.equal(columns[0], 6);
  assert.equal(columns.at(-1), 22);
});

test("buildGrid counts open hours and keeps loading venues in place", () => {
  const model = buildGrid({ selected: new Set(["CC", "SC"]), results });
  assert.deepEqual(model.sections.map((section) => [section.venue.code, section.status]), [["CC", "live"], ["SC", "loading"]]);
  const clapham = model.sections[0];
  assert.equal(clapham.courts.length, 3);
  assert.equal(clapham.free, 4);
  assert.equal(clapham.freeCourts, 3);
  assert.equal(model.totals.loading, 1);
});

test("hour filters hide non-matching courts and venues with nothing free", () => {
  const model = buildGrid({ selected: new Set(["CC", "BP"]), results, hours: new Set([8, 9]) });
  assert.deepEqual(model.sections.map((section) => section.venue.code), ["CC"]);
  assert.deepEqual(model.sections[0].courts.map((row) => row.court.id), ["c1"]);
  assert.deepEqual(model.nothingMatches.map((venue) => venue.code), ["BP"]);
});

test("surface filters drop venues without that surface", () => {
  const model = buildGrid({ selected: new Set(["CC", "BP"]), results, surface: "carpet" });
  assert.deepEqual(model.sections.map((section) => section.venue.code), ["CC"]);
  assert.deepEqual(model.nothingMatches.map((venue) => venue.code), ["BP"]);
  assert.deepEqual(surfacesIn(results, new Set(["CC", "BP"])), ["hard", "carpet"]);
});

test("hours that have already started today don't count", () => {
  const model = buildGrid({ selected: new Set(["CC"]), results, pastBefore: 9 });
  assert.equal(model.sections[0].free, 2);
  assert.equal(model.sections[0].courts.some((row) => row.court.id === "c2"), false, "a court free only earlier is hidden");
});

test("sorting by most free puts the busiest venues last", () => {
  const model = buildGrid({ selected: new Set(["BP", "CC", "SC"]), results, sort: "free" });
  assert.deepEqual(model.sections.map((section) => section.venue.code), ["CC", "BP", "SC"]);
});

test("sorting by distance uses the viewer's position", () => {
  const nearBrockwell = { lat: 51.45, lng: -0.106 };
  const model = buildGrid({ selected: new Set(["CC", "BP"]), results, sort: "near", position: nearBrockwell });
  assert.equal(model.sections[0].venue.code, "BP");
  assert.ok(model.sections[0].distance < 0.5);
});

test("hoursLabel describes the chosen hours compactly", () => {
  assert.equal(hoursLabel(new Set()), "Any time");
  assert.equal(hoursLabel(new Set([19, 18])), "18:00–20:00");
  assert.equal(hoursLabel(new Set([7, 18])), "07:00, 18:00");
  assert.equal(hoursLabel(new Set([7, 9, 11, 13])), "4 hours");
});

test("with hiding turned off every court shows and hours only highlight", () => {
  const shown = buildGrid({ selected: new Set(["CC", "BP"]), results, hours: new Set([8, 9]), hideFull: false });
  assert.deepEqual(shown.sections.map((section) => section.venue.code), ["BP", "CC"]);
  assert.equal(shown.sections[1].courts.length, 3);
  assert.equal(shown.nothingMatches.length, 0);
});

test("with hiding on and no hours chosen, fully booked courts are hidden", () => {
  const withFull = new Map([["CC", {
    status: "live",
    courts: [...courts, { id: "c4", name: "Court 4", surface: "hard" }],
    slots: [slot("c1", "08:00")]
  }]]);
  const model = buildGrid({ selected: new Set(["CC"]), results: withFull });
  assert.deepEqual(model.sections[0].courts.map((row) => row.court.id), ["c1"]);
});

test("open hours are also given as a share of the venue's court-hours", () => {
  const model = buildGrid({ selected: new Set(["CC"]), results, hours: new Set([8, 9]), hideFull: false });
  // 3 courts × 2 chosen hours = 6 court-hours, 4 of them open.
  assert.equal(model.sections[0].free, 4);
  assert.equal(model.sections[0].openShare, 67);
});
