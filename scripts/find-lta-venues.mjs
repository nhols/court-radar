// Finds LTA court-booking venues across South London and writes them to
// public/shared/lta-venues.js. LTA's court search is a server-rendered page,
// so this reads its result cards, follows the pagination, then reads each
// venue page for its coordinates.
//
//   node scripts/find-lta-venues.mjs
//
// Codes already in the output file are kept, so saved preferences and shared
// links keep working after a refresh.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUTPUT = path.join(ROOT, "public/shared/lta-venues.js");
const SEARCH_URL = "https://www.lta.org.uk/play/book-a-tennis-court/";
const AVAILABILITY_URL = "https://www.lta.org.uk/api/courtdetail/availability";

// Search from several points so the 30-result radius covers the whole area.
const CENTRES = [
  ["Clapham", 51.4618, -0.1383],
  ["Wandsworth", 51.4571, -0.1925],
  ["Putney", 51.4613, -0.2166],
  ["Wimbledon", 51.4214, -0.2064],
  ["Tooting", 51.4275, -0.168],
  ["Streatham", 51.428, -0.13],
  ["Brixton", 51.4613, -0.1156],
  ["Dulwich", 51.445, -0.085],
  ["Battersea", 51.479, -0.157],
  ["Kennington", 51.488, -0.111],
  ["Peckham", 51.47, -0.069],
  ["Norbury", 51.411, -0.118]
];

// Roughly Putney to Peckham, Vauxhall to Norbury.
const AREA = { south: 51.4, north: 51.495, west: -0.245, east: -0.055 };

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(url, { headers: { "user-agent": "court-radar venue finder" } });
    if (response.ok) return response.text();
    await sleep(1000 * attempt);
  }
  throw new Error(`Couldn't load ${url}`);
}

function decode(value) {
  return value
    .replaceAll("&amp;", "&")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replaceAll("&quot;", '"')
    .trim();
}

function parseResults(html) {
  const venues = [];
  const card = /<h2 class="lta-card-title[^"]*">\s*<a href="\/play\/book-a-tennis-court\/courts\/([a-z0-9-]+)_([0-9a-f-]{36})\/[^"]*"[^>]*>([^<]+)<\/a>[\s\S]*?<span class="u-caption2[^"]*">([^<(]+)/g;
  let match;
  while ((match = card.exec(html))) {
    venues.push({ slug: match[1], id: match[2], name: decode(match[3]), postcode: decode(match[4]) });
  }
  const next = html.match(/next page" href="([^"]+)"/);
  return { venues, next: next ? new URL(decode(next[1]), SEARCH_URL).toString() : null };
}

async function search([label, lat, lng]) {
  const found = [];
  let url = `${SEARCH_URL}?${new URLSearchParams({ latitude: lat, longitude: lng, location: label })}`;
  while (url) {
    const { venues, next } = parseResults(await get(url));
    found.push(...venues);
    url = next;
    await sleep(300);
  }
  return found;
}

async function coordinates(venue) {
  const html = await get(`${SEARCH_URL}courts/${venue.slug}_${venue.id}/`);
  const match = html.match(/(5\d\.\d{3,})%2C(-?\d\.\d{3,})/);
  return match ? { lat: Number(match[1]), lng: Number(match[2]) } : null;
}

async function hasPublicAvailability(venue) {
  const url = `${AVAILABILITY_URL}?venueid=${venue.id}&date=${new Date().toISOString().slice(0, 10)}`;
  try {
    const payload = JSON.parse(await get(url));
    return !payload.error?.hasError;
  } catch {
    return false;
  }
}

function existingCodes() {
  if (!fs.existsSync(OUTPUT)) return new Map();
  const text = fs.readFileSync(OUTPUT, "utf8");
  return new Map([...text.matchAll(/code: "([A-Z0-9]+)", id: "([0-9a-f-]{36})"/g)].map((match) => [match[2], match[1]]));
}

function makeCode(venue, used) {
  const words = venue.slug.split("-").filter((word) => !["the", "and", "of", "at"].includes(word));
  const initials = words.map((word) => word[0]).join("").toUpperCase().slice(0, 3);
  const candidates = [initials, words[0].slice(0, 3).toUpperCase(), `${initials}${words.at(-1)[1] || ""}`.toUpperCase()];
  for (const candidate of candidates) if (candidate.length >= 2 && !used.has(candidate)) return candidate;
  for (let index = 2; ; index += 1) if (!used.has(`${initials}${index}`)) return `${initials}${index}`;
}

const byId = new Map();
for (const centre of CENTRES) {
  for (const venue of await search(centre)) byId.set(venue.id, venue);
  console.error(`${centre[0]}: ${byId.size} venues so far`);
}

const codes = existingCodes();
// Codes used by hand-written venues in venues.js must not be reused.
const used = new Set([...codes.values(), "FR", "KGP", "LG", "TC", "WC", "WP"]);
const venues = [];
for (const venue of byId.values()) {
  const point = await coordinates(venue);
  await sleep(200);
  if (!point) {
    console.error(`skip ${venue.name}: no coordinates`);
    continue;
  }
  if (point.lat < AREA.south || point.lat > AREA.north || point.lng < AREA.west || point.lng > AREA.east) continue;
  if (!(await hasPublicAvailability(venue))) {
    console.error(`skip ${venue.name}: no public availability`);
    continue;
  }
  const code = codes.get(venue.id) || makeCode(venue, used);
  used.add(code);
  venues.push({ code, ...venue, ...point });
}

venues.sort((a, b) => a.name.localeCompare(b.name));
const lines = venues.map((venue) =>
  `  { code: "${venue.code}", id: "${venue.id}", slug: "${venue.slug}", name: ${JSON.stringify(venue.name)}, postcode: ${JSON.stringify(venue.postcode)}, lat: ${venue.lat}, lng: ${venue.lng} }`);
fs.writeFileSync(OUTPUT, `// Generated by scripts/find-lta-venues.mjs. Re-run it to pick up new venues.
// Every venue here takes public bookings through LTA's court-booking API.

export const LTA_VENUES = [
${lines.join(",\n")}
];
`);
console.error(`Wrote ${venues.length} venues to ${path.relative(ROOT, OUTPUT)}`);
