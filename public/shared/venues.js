import { LTA_VENUES } from "./lta-venues.js";

// The single list of venues Court Radar knows about. Each venue names the
// booking system its availability comes from (`source`) and carries whatever
// identifiers that system needs. Adding a venue on a supported system is one
// entry here; supporting a new system means adding an adapter next to
// mindbody.js and lta.js.

export const SOURCES = {
  mindbody: {
    label: "All Star Tennis",
    short: "AS",
    // Mindbody's widget allows cross-origin requests, and it answers browsers
    // more reliably than it answers Cloudflare, so these load client-side.
    fetchIn: "browser"
  },
  lta: {
    label: "LTA",
    short: "LTA",
    fetchIn: "server"
  }
};

const ALL_STAR_PRICES = {
  standard: { offPeak: 11.5, peak: 16, memberOffPeak: 7.5, memberPeak: 12 },
  furzedown: { offPeak: 8.5, peak: 10.5, memberOffPeak: 6.5, memberPeak: 8.5 }
};

function allStar({ code, name, locationId, publicSession, memberSession, lat, lng, courts, prices, pricingNote }) {
  return {
    code,
    name,
    group: "All Star Tennis",
    source: "mindbody",
    lat,
    lng,
    rules: "Public 2 days ahead · Member Plus 14 days ahead",
    bookingUrl: "https://allstartennis.co.uk/court-hire/",
    mindbody: { locationId, publicSession, memberSession },
    prices: prices || ALL_STAR_PRICES.standard,
    pricingNote,
    courts: courts.map(([id, courtName, surface]) => ({ id, name: courtName, surface }))
  };
}

const LTA_OVERRIDES = {
  BPK: {
    name: "Battersea Park",
    rules: "Guests 1 day ahead · priority members 1 week ahead",
    bookingUrl: "https://clubspark.lta.org.uk/BatterseaParkTennisCourts/Booking/BookByDate"
  }
};

function lta({ code, id, slug, name, postcode, lat, lng }) {
  return {
    code,
    name,
    group: "LTA",
    source: "lta",
    lat,
    lng,
    postcode,
    rules: "Book up to 6 days ahead",
    bookingUrl: `https://www.lta.org.uk/play/book-a-tennis-court/courts/${slug}_${id}/`,
    lta: { id },
    ...LTA_OVERRIDES[code]
  };
}

export const VENUES = [
  allStar({
    code: "FR", name: "Furzedown Rec", locationId: "6", publicSession: "2233", memberSession: "2230",
    lat: 51.425545, lng: -0.15159, prices: ALL_STAR_PRICES.furzedown,
    courts: [["100000025", "Court 1", "hard"], ["100000026", "Court 2", "hard"]]
  }),
  allStar({
    code: "KGP", name: "King Georges Park", locationId: "2", publicSession: "2208", memberSession: "2237",
    lat: 51.453263, lng: -0.195694,
    pricingNote: "Floodlit sessions are £23 public / £17 Member Plus",
    courts: [
      ["100000068", "Court 1", "hard"], ["100000009", "Court 2", "hard"], ["100000010", "Court 3", "hard"],
      ["100000011", "Court 4", "hard"], ["100000012", "Court 5", "hard"], ["100000013", "Court 6", "carpet"],
      ["100000014", "Court 7", "carpet"], ["100000015", "Court 8", "carpet"], ["100000016", "Court 9", "carpet"],
      ["100000017", "Court 10", "carpet"]
    ]
  }),
  allStar({
    code: "LG", name: "Leader's Gardens", locationId: "4", publicSession: "2203", memberSession: "2202",
    lat: 51.470104, lng: -0.222371,
    courts: [["100000021", "Court 1", "hard"], ["100000022", "Court 2", "hard"], ["100000023", "Court 3", "hard"]]
  }),
  allStar({
    code: "TC", name: "Tooting Common", locationId: "3", publicSession: "2218", memberSession: "2226",
    lat: 51.433146, lng: -0.146127,
    courts: [
      ["100000018", "Court 1", "hard"], ["100000019", "Court 2", "hard"], ["100000020", "Court 3", "hard"],
      ["100000028", "Court 4", "carpet"], ["100000029", "Court 5", "carpet"], ["100000027", "Court 6", "carpet"]
    ]
  }),
  allStar({
    code: "WC", name: "Wandsworth Common", locationId: "1", publicSession: "2215", memberSession: "2212",
    lat: 51.452805, lng: -0.17046,
    courts: [
      ["100000002", "Court 1", "hard"], ["100000003", "Court 2", "hard"], ["100000004", "Court 3", "hard"],
      ["100000005", "Court 4", "hard"], ["100000006", "Court 5", "hard"], ["100000007", "Court 6", "hard"]
    ]
  }),
  allStar({
    code: "WP", name: "Wandsworth Park", locationId: "5", publicSession: "2221", memberSession: "2229",
    lat: 51.461378, lng: -0.201914,
    courts: [["100000024", "Court 1", "hard"]]
  }),
  ...LTA_VENUES.map(lta)
];

const BY_CODE = new Map(VENUES.map((venue) => [venue.code, venue]));

export function venueByCode(code) {
  return BY_CODE.get(code);
}

// New visitors start with no venues and pick their own.
export const DEFAULT_VENUE_CODES = [];

export function bookingUrlForDate(venue, date) {
  if (venue.code === "BPK") return `${venue.bookingUrl}#?date=${date}&role=guest`;
  if (venue.source === "lta") return `${venue.bookingUrl}?date=${date}`;
  return venue.bookingUrl;
}

export function googleMapsUrl(venue) {
  return `https://www.google.com/maps/search/?api=1&query=${venue.lat},${venue.lng}`;
}
