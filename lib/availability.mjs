const MINDBODY_BASE = "https://widgets.mindbodyonline.com/widgets/appointments";
const LTA_AVAILABILITY_URL = "https://www.lta.org.uk/api/courtdetail/availability";
const BATTERSEA_BASE = "https://clubspark.lta.org.uk";

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

const LTA_LOCATIONS = [
  ["2fb20762-62d1-4fc7-961c-f4404d4d1ae8", "CC", "clapham-common_2fb20762-62d1-4fc7-961c-f4404d4d1ae8", "Clapham Common", 51.4618013, -0.1383039],
  ["5c1fcb26-be28-4ac4-932f-fc26e6207e90", "SC", "streatham-common_5c1fcb26-be28-4ac4-932f-fc26e6207e90", "Streatham Common", 51.4216468, -0.1250177],
  ["29dfbcd8-c72b-4629-ba93-212c3d73ee6a", "SV", "streatham-vale-park_29dfbcd8-c72b-4629-ba93-212c3d73ee6a", "Streatham Vale Park", 51.4136161, -0.1452499],
  ["03a2d315-2b9a-411d-8891-1bfde4cb4cf3", "BP", "brockwell-park_03a2d315-2b9a-411d-8891-1bfde4cb4cf3", "Brockwell Park", 51.4505301, -0.1060926],
  ["e014e2b3-7f87-4fe0-9261-4a2b5ba0fa49", "BL", "belair-park_e014e2b3-7f87-4fe0-9261-4a2b5ba0fa49", "Belair Park", 51.4432317, -0.0907465]
].map(([id, code, slug, name, lat, lng]) => ({
  id,
  code,
  slug,
  name,
  lat,
  lng,
  provider: "LTA",
  advanceRule: "public booking · today + 6",
  premiumRule: "Annual passes may reduce fees · published window stays 7 days",
  bookingUrl: `https://www.lta.org.uk/play/book-a-tennis-court/courts/${slug}/`
}));

const BATTERSEA = {
  id: "b2eed0a9-2cf4-4d9d-95b8-46248117c9ba",
  code: "BPK",
  name: "Battersea Park",
  provider: "ClubSpark",
  lat: 51.4792126,
  lng: -0.1570583,
  advanceRule: "guest booking · 1 day ahead",
  premiumRule: "Priority membership · 1 week ahead",
  bookingUrl: `${BATTERSEA_BASE}/BatterseaParkTennisCourts/Booking/BookByDate`
};

const BATTERSEA_COURTS = [
  ...Array.from({ length: 10 }, (_, index) => index + 1),
  14, 15, 16, 17, 18, 19
].map((number) => ({
  id: `battersea-court-${number}`,
  name: `Court ${number}`,
  location: BATTERSEA.code,
  surface: number >= 17 ? "carpet" : "hard"
}));

const batterseaCache = new Map();

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

export function parseAvailability(html, locationCode) {
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

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

export function toTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function surfaceName(surface) {
  return String(surface || "hard").toLowerCase().replace("tarmac", "hard");
}

export function allStarPrice(locationCode, date, time) {
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

function londonDateString(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

export function daysFromLondonToday(date) {
  const today = new Date(`${londonDateString()}T12:00:00Z`);
  const target = new Date(`${date}T12:00:00Z`);
  return Math.round((target - today) / 86_400_000);
}

async function checkedFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000)
  });
  if (!response.ok) throw new Error(`${new URL(url).hostname} returned ${response.status}`);
  return response;
}

async function getJson(url, options) {
  return checkedFetch(url, {
    headers: { accept: "application/json", ...options?.headers }
  }).then((response) => response.json());
}

async function fetchAllStarLocation(location, date) {
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
  const response = await checkedFetch(`${MINDBODY_BASE}/${widget}/results.json?${params}`, {
    headers: { accept: "application/javascript, application/json" }
  });
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

async function fetchLtaLocation(location, date) {
  const url = new URL(LTA_AVAILABILITY_URL);
  url.searchParams.set("venueid", location.id);
  url.searchParams.set("date", date);
  const payload = await getJson(url);
  if (payload.error?.hasError) throw new Error(payload.error.errorMessage || "LTA availability failed");

  const courts = (payload.venueDetails || []).map((court) => ({
    id: court.id,
    name: court.name,
    location: location.code,
    surface: surfaceName(court.surface)
  }));
  const bookingUrl = `${location.bookingUrl}?date=${date}`;
  const slots = (payload.venueDetails || []).flatMap((court) =>
    (court.availableSlots || []).map((slot) => ({
      courtId: court.id,
      court: court.name,
      location: location.code,
      time: slot.startTime.slice(11, 16),
      endTime: slot.endTime.slice(11, 16),
      price: slot.price,
      bookingUrl
    }))
  );

  return { location, courts, slots };
}

export function parseBatterseaAvailability(payload, date) {
  const bookingUrl = `${BATTERSEA.bookingUrl}#?date=${date}&role=guest`;
  const courts = (payload.Resources || []).map((court) => ({
    id: court.ID,
    name: court.Name,
    location: BATTERSEA.code,
    surface: court.Surface === 3 ? "carpet" : court.Surface === 7 ? "hard" : "other"
  }));
  const slots = [];

  for (const court of payload.Resources || []) {
    const sessions = court.Days?.find((day) => day.Date.startsWith(date))?.Sessions || [];
    const availableSessions = sessions.filter((session) => session.Capacity > 0);

    for (const session of availableSessions) {
      for (
        let start = session.StartTime;
        start + payload.MinimumInterval <= session.EndTime;
        start += payload.MinimumInterval
      ) {
        slots.push({
          courtId: court.ID,
          court: court.Name,
          location: BATTERSEA.code,
          time: toTime(start),
          endTime: toTime(start + payload.MinimumInterval),
          price: session.GuestPrice || session.CourtCost || session.Cost || undefined,
          bookingUrl
        });
      }
    }
  }

  return { location: BATTERSEA, courts, slots };
}

async function fetchBattersea(date) {
  const url = new URL(
    `${BATTERSEA_BASE}/v0/VenueBooking/BatterseaParkTennisCourts/GetVenueSessions`
  );
  url.searchParams.set("resourceID", "");
  url.searchParams.set("startDate", date);
  url.searchParams.set("endDate", date);
  url.searchParams.set("roleId", "");

  try {
    const payload = await getJson(url, {
      headers: {
        referer: `${BATTERSEA_BASE}/BatterseaParkTennisCourts/Booking/BookByDate`
      }
    });
    const result = parseBatterseaAvailability(payload, date);
    const complete = { ...result, location: { ...result.location, availabilityStatus: "live" } };
    batterseaCache.set(date, complete);
    return complete;
  } catch {
    const cached = batterseaCache.get(date);
    if (cached) {
      return {
        ...cached,
        location: {
          ...cached.location,
          availabilityStatus: "cached",
          statusNote: "Showing the last successful ClubSpark response"
        }
      };
    }
    return {
      location: {
        ...BATTERSEA,
        availabilityStatus: "unavailable",
        statusNote: "ClubSpark is blocking the live feed right now — use the manual import"
      },
      courts: BATTERSEA_COURTS,
      slots: []
    };
  }
}

export async function getAvailability(date, options = {}) {
  if (!isValidDate(date)) {
    return {
      status: 400,
      data: { error: "Use a valid date in YYYY-MM-DD format." }
    };
  }

  const sources = [
    ...(!options.skipAllStar ? ALL_STAR_LOCATIONS.map((location) => ({
      code: location.code,
      promise: fetchAllStarLocation(location, date)
    })) : []),
    ...LTA_LOCATIONS.map((location) => ({
      code: location.code,
      promise: fetchLtaLocation(location, date)
    })),
    { code: BATTERSEA.code, promise: fetchBattersea(date) }
  ];
  const settled = await Promise.allSettled(sources.map((source) => source.promise));
  const successful = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  const errors = settled.flatMap((result, index) =>
    result.status === "rejected"
      ? [{ location: sources[index].code, message: result.reason.message }]
      : []
  );

  return {
    status: successful.length ? 200 : 502,
    data: {
      date,
      fetchedAt: new Date().toISOString(),
      locations: successful.map((result) => result.location),
      courts: successful.flatMap((result) => result.courts),
      slots: successful.flatMap((result) => result.slots),
      errors
    }
  };
}
