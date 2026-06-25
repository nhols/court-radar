const test = require("node:test");
const assert = require("node:assert/strict");
const {
  endpointForLocation,
  fetchAvailability,
  fetchLocation,
  isAllStarCode,
  mergeIntoAvailability,
  parseAvailability,
  parseJsonp,
  recoverAvailability
} = require("../public/allstar-browser");

const DATE = "2026-06-25";
const HTML = `
  <div class="healcode-trainer">
    <div class="trainer-label location-_6 trainer-100000025">
      <a href="">Court 1 FR</a>
    </div>
    <span class="appointment pill-button">
      <a data-url="https://example.test/book?a=1&amp;b=2" class="hc-button filterable">07:00</a>
    </span>
  </div>
`;

test("endpointForLocation builds the Mindbody URL for a location and date", () => {
  const url = new URL(endpointForLocation("FR", DATE));
  assert.equal(url.hostname, "widgets.mindbodyonline.com");
  assert.equal(url.pathname.endsWith("/results.json"), true);
  assert.equal(url.searchParams.get("options[session_type_ids]"), "2233");
  assert.equal(url.searchParams.get("options[start_date]"), DATE);
  assert.equal(url.searchParams.get("options[end_date]"), DATE);
  assert.equal(url.searchParams.get("options[location_id]"), "6");
});

test("parseJsonp and parseAvailability read the All Star widget response", () => {
  const payload = parseJsonp(JSON.stringify({ contents: HTML }));
  assert.deepEqual(parseAvailability(payload.contents, "FR"), [{
    courtId: "100000025",
    court: "Court 1 FR",
    location: "FR",
    time: "07:00",
    bookingUrl: "https://example.test/book?a=1&b=2"
  }]);
});

test("fetchLocation converts a browser Mindbody response into availability", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    text: async () => JSON.stringify({ contents: HTML })
  });

  try {
    const result = await fetchLocation("FR", DATE);
    assert.equal(result.location.code, "FR");
    assert.equal(result.courts.length, 2);
    assert.equal(result.slots[0].time, "07:00");
    assert.equal(result.slots[0].price, 8.5);
  } finally {
    global.fetch = originalFetch;
  }
});

test("mergeIntoAvailability replaces recovered All Star failures and leaves other providers", () => {
  const merged = mergeIntoAvailability({
    date: DATE,
    locations: [{ code: "CC", provider: "LTA" }],
    courts: [{ id: "cc-1", location: "CC" }],
    slots: [{ courtId: "cc-1", location: "CC" }],
    errors: [{ location: "FR" }, { location: "BPK" }]
  }, [{
    location: { code: "FR", provider: "All Star" },
    courts: [{ id: "fr-1", location: "FR" }],
    slots: [{ courtId: "fr-1", location: "FR" }]
  }], []);

  assert.deepEqual(merged.locations.map((location) => location.code), ["FR", "CC"]);
  assert.deepEqual(merged.courts.map((court) => court.id), ["cc-1", "fr-1"]);
  assert.deepEqual(merged.errors, [{ location: "BPK" }]);
});

test("recoverAvailability retries only All Star errors", async () => {
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      text: async () => JSON.stringify({ contents: HTML })
    };
  };

  try {
    const recovered = await recoverAvailability({
      date: DATE,
      locations: [{ code: "CC", provider: "LTA" }],
      courts: [{ id: "cc-1", location: "CC" }],
      slots: [{ courtId: "cc-1", location: "CC" }],
      errors: [{ location: "FR" }, { location: "BPK" }]
    });

    assert.equal(requestedUrls.length, 1);
    assert.equal(new URL(requestedUrls[0]).hostname, "widgets.mindbodyonline.com");
    assert.deepEqual(recovered.errors, [{ location: "BPK" }]);
    assert.equal(recovered.locations.some((location) => location.code === "FR"), true);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchAvailability loads every All Star location from the browser", async () => {
  const originalFetch = global.fetch;
  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(url);
    return {
      ok: true,
      text: async () => JSON.stringify({ contents: HTML })
    };
  };

  try {
    const recovered = await fetchAvailability({
      date: DATE,
      locations: [{ code: "CC", provider: "LTA" }],
      courts: [{ id: "cc-1", location: "CC" }],
      slots: [{ courtId: "cc-1", location: "CC" }],
      errors: []
    });

    assert.equal(requestedUrls.length, 6);
    assert.equal(recovered.locations.filter((location) => isAllStarCode(location.code)).length, 6);
    assert.deepEqual(recovered.errors, []);
  } finally {
    global.fetch = originalFetch;
  }
});

test("isAllStarCode identifies only All Star locations", () => {
  assert.equal(isAllStarCode("FR"), true);
  assert.equal(isAllStarCode("CC"), false);
});
