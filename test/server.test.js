const test = require("node:test");
const assert = require("node:assert/strict");
let {
  decodeHtml,
  parseJsonp,
  parseAvailability,
  parseBatterseaAvailability,
  allStarPrice,
  daysFromLondonToday,
  toTime,
  isValidDate
} = {};

test.before(async () => {
  ({
    decodeHtml,
    parseJsonp,
    parseAvailability,
    parseBatterseaAvailability,
    allStarPrice,
    daysFromLondonToday,
    toTime,
    isValidDate
  } = await import("../lib/availability.mjs"));
});

test("parseJsonp unwraps Mindbody's response", () => {
  assert.deepEqual(parseJsonp('({"contents":"hello"});'), { contents: "hello" });
});

test("parseAvailability extracts courts, times and booking URLs", () => {
  const html = `
    <div class="healcode-trainer">
      <div class="trainer-label location-_2 trainer-123">
        <a href="">Court 1 KGP</a>
      </div>
      <span class="appointment pill-button">
        <a data-url="https://example.test/book?a=1&amp;b=2" class="hc-button filterable">07:00</a>
      </span>
      <span class="appointment pill-button">
        <a data-url="https://example.test/book?time=8" class="hc-button filterable">08:00</a>
      </span>
    </div>
  `;
  assert.deepEqual(parseAvailability(html, "KGP"), [
    {
      courtId: "123",
      court: "Court 1 KGP",
      location: "KGP",
      time: "07:00",
      bookingUrl: "https://example.test/book?a=1&b=2"
    },
    {
      courtId: "123",
      court: "Court 1 KGP",
      location: "KGP",
      time: "08:00",
      bookingUrl: "https://example.test/book?time=8"
    }
  ]);
});

test("isValidDate rejects malformed and impossible dates", () => {
  assert.equal(isValidDate("2026-06-21"), true);
  assert.equal(isValidDate("2026-02-31"), false);
  assert.equal(isValidDate("21/06/2026"), false);
});

test("decodeHtml handles the entities used in widget links", () => {
  assert.equal(decodeHtml("Leader&#39;s &amp; Courts"), "Leader's & Courts");
});

test("parseBatterseaAvailability follows ClubSpark's positive-capacity rule", () => {
  const result = parseBatterseaAvailability({
    EarliestStartTime: 420,
    LatestEndTime: 600,
    MinimumInterval: 60,
    Resources: [{
      ID: "court-1",
      Name: "Court 1",
      Surface: 7,
      Days: [{
        Date: "2026-06-21T00:00:00",
        Sessions: [
          {
            Name: "Booking",
            Colour: "#fcfabd",
            Recurrence: false,
            StartTime: 420,
            EndTime: 540,
            CourtCost: 15,
            Capacity: 1
          },
          {
            Name: "Booking",
            Colour: "#fcfabd",
            Recurrence: false,
            StartTime: 540,
            EndTime: 600,
            CourtCost: 15,
            Capacity: 0
          }
        ]
      }]
    }]
  }, "2026-06-21");

  assert.deepEqual(result.slots.map((slot) => slot.time), ["07:00", "08:00"]);
  assert.equal(result.slots[0].price, 15);
  assert.equal(result.courts[0].surface, "hard");
});

test("toTime formats ClubSpark minute offsets", () => {
  assert.equal(toTime(450), "07:30");
});

test("allStarPrice applies published public and Member Plus bands", () => {
  assert.deepEqual(allStarPrice("FR", "2026-06-22", "09:00"), {
    price: 8.5,
    memberPrice: 6.5,
    pricePeriod: "off-peak",
    pricingNote: undefined
  });
  assert.equal(allStarPrice("WC", "2026-06-22", "17:00").price, 16);
  assert.equal(allStarPrice("KGP", "2026-06-21", "18:00").pricingNote.includes("£23"), true);
});

test("daysFromLondonToday measures the selected booking window", () => {
  const today = new Date(`${new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date())}T12:00:00Z`);
  today.setUTCDate(today.getUTCDate() + 3);
  assert.equal(daysFromLondonToday(today.toISOString().slice(0, 10)), 3);
});
