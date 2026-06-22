const test = require("node:test");
const assert = require("node:assert/strict");
const { courtsAvailableAtAllTimes } = require("../public/availability-filter.js");

const courts = [
  { id: "court-1", name: "Court 1" },
  { id: "court-2", name: "Court 2" },
  { id: "court-3", name: "Court 3" }
];

const slots = [
  { courtId: "court-1", time: "08:00" },
  { courtId: "court-1", time: "09:00" },
  { courtId: "court-2", time: "08:00" },
  { courtId: "court-3", time: "09:00" }
];

test("returns every court when no hours are selected", () => {
  assert.deepEqual(courtsAvailableAtAllTimes(courts, slots, []), courts);
});

test("keeps only courts available at every selected hour", () => {
  assert.deepEqual(
    courtsAvailableAtAllTimes(courts, slots, ["08:00", "09:00"]),
    [courts[0]]
  );
});

test("does not match a court that is available at only one selected hour", () => {
  assert.deepEqual(
    courtsAvailableAtAllTimes(courts, slots, ["08:00", "10:00"]),
    []
  );
});
