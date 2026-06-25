(function attachAllStarBrowser(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.AllStarBrowser = api;
})(typeof globalThis === "object" ? globalThis : this, function createAllStarBrowser() {
  const MINDBODY_BASE = "https://widgets.mindbodyonline.com/widgets/appointments";
  const ALL_STAR_LOCATIONS = [
    { id: "6", code: "FR", name: "Furzedown Rec", freeSession: "2233", memberSession: "2230", lat: 51.425545, lng: -0.151590 },
    { id: "2", code: "KGP", name: "King Georges Park", freeSession: "2208", memberSession: "2237", lat: 51.453263, lng: -0.195694 },
    { id: "4", code: "LG", name: "Leader's Gardens", freeSession: "2203", memberSession: "2202", lat: 51.470104, lng: -0.222371 },
    { id: "3", code: "TC", name: "Tooting Common", freeSession: "2218", memberSession: "2226", lat: 51.433146, lng: -0.146127 },
    { id: "1", code: "WC", name: "Wandsworth Common", freeSession: "2215", memberSession: "2212", lat: 51.452805, lng: -0.170460 },
    { id: "5", code: "WP", name: "Wandsworth Park", freeSession: "2221", memberSession: "2229", lat: 51.461378, lng: -0.201914 }
  ].map((location) => ({
    ...location,
    provider: "All Star",
    advanceRule: "public booking · 2 days ahead",
    premiumRule: "Member Plus · 14 days ahead",
    pricingRule: location.code === "FR"
      ? "Public £8.50 off-peak · £10.50 peak · bank holidays peak"
      : location.code === "KGP"
        ? "Public £11.50 off-peak · £16 peak · £23 floodlit · bank holidays peak"
        : "Public £11.50 off-peak · £16 peak · bank holidays peak",
    bookingUrl: "https://allstartennis.co.uk/court-hire/"
  }));

  const ALL_STAR_COURTS = [
    ["100000025", "Court 1", "FR", "hard"],
    ["100000026", "Court 2", "FR", "hard"],
    ["100000068", "Court 1", "KGP", "hard"],
    ["100000009", "Court 2", "KGP", "hard"],
    ["100000010", "Court 3", "KGP", "hard"],
    ["100000011", "Court 4", "KGP", "hard"],
    ["100000012", "Court 5", "KGP", "hard"],
    ["100000013", "Court 6", "KGP", "carpet"],
    ["100000014", "Court 7", "KGP", "carpet"],
    ["100000015", "Court 8", "KGP", "carpet"],
    ["100000016", "Court 9", "KGP", "carpet"],
    ["100000017", "Court 10", "KGP", "carpet"],
    ["100000021", "Court 1", "LG", "hard"],
    ["100000022", "Court 2", "LG", "hard"],
    ["100000023", "Court 3", "LG", "hard"],
    ["100000018", "Court 1", "TC", "hard"],
    ["100000019", "Court 2", "TC", "hard"],
    ["100000020", "Court 3", "TC", "hard"],
    ["100000028", "Court 4", "TC", "carpet"],
    ["100000029", "Court 5", "TC", "carpet"],
    ["100000027", "Court 6", "TC", "carpet"],
    ["100000002", "Court 1", "WC", "hard"],
    ["100000003", "Court 2", "WC", "hard"],
    ["100000004", "Court 3", "WC", "hard"],
    ["100000005", "Court 4", "WC", "hard"],
    ["100000006", "Court 5", "WC", "hard"],
    ["100000007", "Court 6", "WC", "hard"],
    ["100000024", "Court 1", "WP", "hard"]
  ].map(([id, name, location, surface]) => ({ id, name, location, surface }));

  const ALL_STAR_CODES = new Set(ALL_STAR_LOCATIONS.map((location) => location.code));

  function decodeHtml(value) {
    return value
      .replaceAll("&amp;", "&")
      .replaceAll("&#39;", "'")
      .replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">");
  }

  function parseJsonp(text) {
    const trimmed = text.trim();
    const json = trimmed.startsWith("(") && trimmed.endsWith(");")
      ? trimmed.slice(1, -2)
      : trimmed;
    return JSON.parse(json);
  }

  function parseAvailability(html, locationCode) {
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
          location: locationCode,
          time: slotMatch[2],
          bookingUrl: decodeHtml(slotMatch[1])
        });
      }
    }

    return results;
  }

  function londonDateString(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  function daysFromLondonToday(date) {
    const today = new Date(`${londonDateString()}T12:00:00Z`);
    const target = new Date(`${date}T12:00:00Z`);
    return Math.round((target - today) / 86_400_000);
  }

  function allStarPrice(locationCode, date, time) {
    const day = new Date(`${date}T12:00:00Z`).getUTCDay();
    const hour = Number(time.slice(0, 2));
    const peak = day === 0 || day === 6 || hour >= 16;
    const furzedown = locationCode === "FR";

    return {
      price: furzedown ? (peak ? 10.5 : 8.5) : (peak ? 16 : 11.5),
      memberPrice: furzedown ? (peak ? 8.5 : 6.5) : (peak ? 12 : 7.5),
      pricePeriod: peak ? "peak" : "off-peak",
      pricingNote: locationCode === "KGP" && peak
        ? "Floodlit sessions are £23 public / £17 Member Plus when applied"
        : undefined
    };
  }

  function endpointForLocation(locationCode, date) {
    const location = ALL_STAR_LOCATIONS.find((candidate) => candidate.code === locationCode);
    if (!location) throw new Error(`Unknown All Star location: ${locationCode}`);

    const daysAhead = daysFromLondonToday(date);
    const premiumOnly = daysAhead > 2;
    const widget = premiumOnly ? "ce84234c767" : "ce84117c767";
    const session = premiumOnly ? location.memberSession : location.freeSession;
    const params = new URLSearchParams({
      "options[session_type_ids]": session,
      "options[start_date]": date,
      "options[end_date]": date,
      "options[location_id]": location.id,
      "options[staff_ids][]": ""
    });
    return `${MINDBODY_BASE}/${widget}/results.json?${params}`;
  }

  async function fetchLocation(locationCode, date) {
    const location = ALL_STAR_LOCATIONS.find((candidate) => candidate.code === locationCode);
    if (!location) throw new Error(`Unknown All Star location: ${locationCode}`);

    const daysAhead = daysFromLondonToday(date);
    const premiumOnly = daysAhead > 2;
    const response = await fetch(endpointForLocation(locationCode, date), {
      headers: { accept: "application/javascript, application/json" },
      credentials: "omit"
    });
    if (!response.ok) throw new Error(`widgets.mindbodyonline.com returned ${response.status}`);

    const payload = parseJsonp(await response.text());
    const slots = parseAvailability(payload.contents || "", location.code).map((slot) => ({
      ...slot,
      ...allStarPrice(location.code, date, slot.time),
      premiumOnly
    }));

    return {
      location: {
        ...location,
        availabilityStatus: daysAhead > 14 ? "outside-window" : "live",
        statusNote: premiumOnly
          ? "Availability shown is bookable by Member Plus customers only"
          : undefined
      },
      courts: ALL_STAR_COURTS.filter((court) => court.location === location.code),
      slots
    };
  }

  function mergeIntoAvailability(data, recovered, failedErrors) {
    const recoveredByCode = new Map(recovered.map((result) => [result.location.code, result]));
    const retriedCodes = new Set([
      ...recoveredByCode.keys(),
      ...failedErrors.map((error) => error.location)
    ]);
    const existingAllStarByCode = new Map(
      data.locations
        .filter((location) => ALL_STAR_CODES.has(location.code) && !retriedCodes.has(location.code))
        .map((location) => [location.code, location])
    );

    const allStarLocations = ALL_STAR_LOCATIONS.flatMap((location) => {
      const recoveredResult = recoveredByCode.get(location.code);
      if (recoveredResult) return [recoveredResult.location];
      const existingLocation = existingAllStarByCode.get(location.code);
      return existingLocation ? [existingLocation] : [];
    });

    return {
      ...data,
      locations: [
        ...allStarLocations,
        ...data.locations.filter((location) => !ALL_STAR_CODES.has(location.code))
      ],
      courts: [
        ...data.courts.filter((court) => !retriedCodes.has(court.location)),
        ...recovered.flatMap((result) => result.courts)
      ],
      slots: [
        ...data.slots.filter((slot) => !retriedCodes.has(slot.location)),
        ...recovered.flatMap((result) => result.slots)
      ],
      errors: [
        ...(data.errors || []).filter((error) => !ALL_STAR_CODES.has(error.location)),
        ...failedErrors
      ]
    };
  }

  async function recoverAvailability(data) {
    const failedCodes = (data.errors || [])
      .map((error) => error.location)
      .filter((code) => ALL_STAR_CODES.has(code));

    if (!failedCodes.length) return data;

    const settled = await Promise.allSettled(
      failedCodes.map((locationCode) => fetchLocation(locationCode, data.date))
    );
    const recovered = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const failedErrors = settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ location: failedCodes[index], message: result.reason.message }]
        : []
    );

    return mergeIntoAvailability(data, recovered, failedErrors);
  }

  async function fetchAvailability(data) {
    const settled = await Promise.allSettled(
      ALL_STAR_LOCATIONS.map((location) => fetchLocation(location.code, data.date))
    );
    const recovered = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    const failedErrors = settled.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ location: ALL_STAR_LOCATIONS[index].code, message: result.reason.message }]
        : []
    );

    return mergeIntoAvailability(data, recovered, failedErrors);
  }

  function isAllStarCode(code) {
    return ALL_STAR_CODES.has(code);
  }

  return {
    endpointForLocation,
    fetchAvailability,
    fetchLocation,
    isAllStarCode,
    mergeIntoAvailability,
    parseAvailability,
    parseJsonp,
    recoverAvailability
  };
});
