const test = require("node:test");
const assert = require("node:assert/strict");
const {
  endpointForDate,
  importText,
  mergeIntoAvailability,
  parseJson
} = require("../public/battersea-import");

const DATE = "2026-06-22";
const PAYLOAD = {
  MinimumInterval: 60,
  Resources: [{
    ID: "court-1",
    Name: "Court 1",
    Surface: 7,
    Days: [{
      Date: `${DATE}T00:00:00`,
      Sessions: [
        { StartTime: 420, EndTime: 540, Capacity: 1, GuestPrice: 15 },
        { StartTime: 540, EndTime: 600, Capacity: 0, GuestPrice: 15 }
      ]
    }]
  }]
};

test("endpointForDate builds the date-specific ClubSpark URL", () => {
  const url = new URL(endpointForDate(DATE));
  assert.equal(url.hostname, "clubspark.lta.org.uk");
  assert.equal(url.searchParams.get("startDate"), DATE);
  assert.equal(url.searchParams.get("endDate"), DATE);
});

test("importText parses pasted ClubSpark JSON into Battersea availability", () => {
  const result = importText(JSON.stringify(PAYLOAD), DATE);
  assert.equal(result.location.code, "BPK");
  assert.equal(result.location.availabilityStatus, "imported");
  assert.deepEqual(result.slots.map((slot) => slot.time), ["07:00", "08:00"]);
  assert.equal(result.slots[0].price, 15);
});

test("importText rejects a response for a different date", () => {
  assert.throws(
    () => importText(JSON.stringify(PAYLOAD), "2026-06-23"),
    /does not contain availability/
  );
});

test("parseJson gives a useful error for copied challenge HTML", () => {
  assert.throws(
    () => parseJson("<!doctype html><title>Just a moment...</title>"),
    /not valid JSON/
  );
});

test("mergeIntoAvailability replaces only Battersea data and errors", () => {
  const imported = importText(JSON.stringify(PAYLOAD), DATE);
  const merged = mergeIntoAvailability({
    date: DATE,
    locations: [{ code: "CC" }, { code: "BPK", availabilityStatus: "unavailable" }],
    courts: [{ id: "cc-1", location: "CC" }, { id: "old-bpk", location: "BPK" }],
    slots: [{ courtId: "cc-1", location: "CC" }],
    errors: [{ location: "BPK" }, { location: "CC" }]
  }, imported);

  assert.deepEqual(merged.locations.map((location) => location.code), ["CC", "BPK"]);
  assert.deepEqual(merged.courts.map((court) => court.id), ["cc-1", "court-1"]);
  assert.deepEqual(merged.errors, [{ location: "CC" }]);
});
