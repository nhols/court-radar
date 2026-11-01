import test from "node:test";
import assert from "node:assert/strict";
import {
  STORAGE_KEY,
  buildSearch,
  defaultDate,
  initialState,
  parseSearch,
  readStored,
  writeStored
} from "../public/js/prefs.js";

// 10:00 in London on 22 June 2026 (BST).
const MORNING = new Date("2026-06-22T09:00:00Z");
const LATE = new Date("2026-06-22T20:30:00Z");

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    values
  };
}

test("defaultDate opens on today, or tomorrow once the evening is over", () => {
  assert.equal(defaultDate(MORNING), "2026-06-22");
  assert.equal(defaultDate(LATE), "2026-06-23");
});

test("new visitors start with no venues, any time and any surface", () => {
  const state = initialState({ storage: memoryStorage(), now: MORNING });
  assert.equal(state.venues.size, 0);
  assert.equal(state.hours.size, 0);
  assert.equal(state.surface, "any");
  assert.equal(state.date, "2026-06-22");
});

test("stored preferences survive a round trip and tolerate junk", () => {
  const storage = memoryStorage();
  const state = initialState({ storage, now: MORNING });
  state.venues = new Set(["CC", "BL", "GONE"]);
  state.date = "2026-06-24";
  state.hours = new Set([18, 19]);
  state.surface = "carpet";
  state.view = "map";
  state.collapsed = new Set(["KGP"]);
  writeStored(storage, state);

  const restored = initialState({ storage, now: MORNING });
  assert.deepEqual([...restored.venues], ["BL", "CC"]);
  assert.deepEqual([...restored.hours], [18, 19]);
  assert.equal(restored.surface, "carpet");
  assert.equal(restored.view, "map");
  assert.deepEqual([...restored.collapsed], ["KGP"]);
  assert.equal(restored.date, "2026-06-24");
  const later = initialState({ storage, now: new Date("2026-06-25T09:00:00Z") });
  assert.equal(later.date, "2026-06-25", "a remembered date that has passed falls back to today");

  assert.deepEqual(readStored(memoryStorage({ [STORAGE_KEY]: "{not json" })), {});
  assert.deepEqual(readStored({ getItem: () => { throw new Error("blocked"); } }), {});
  const junk = readStored(memoryStorage({ [STORAGE_KEY]: JSON.stringify({ hours: [99, "x", 7], view: "3d" }) }));
  assert.deepEqual(junk.hours, [7]);
  assert.equal(junk.view, undefined);
});

test("parseSearch reads the shareable URL format", () => {
  const parsed = parseSearch("?date=2026-06-23&v=cc,BP,nope&h=19,18,40&match=any&surface=hard&view=map&sort=free");
  assert.equal(parsed.date, "2026-06-23");
  assert.deepEqual([...parsed.venues], ["CC", "BP"]);
  assert.deepEqual(parsed.hours, [18, 19]);
  assert.equal(parsed.match, "any");
  assert.equal(parsed.surface, "hard");
  assert.equal(parsed.view, "map");
  assert.equal(parsed.sort, "free");
  assert.deepEqual(parseSearch("?view=3d&match=maybe"), {});
});

test("the URL wins over stored preferences", () => {
  const storage = memoryStorage();
  const stored = initialState({ storage, now: MORNING });
  stored.hours = new Set([7]);
  stored.surface = "carpet";
  writeStored(storage, stored);

  const state = initialState({ search: "?v=CC,BP&h=18,19", storage, now: MORNING });
  assert.deepEqual([...state.venues], ["CC", "BP"]);
  assert.deepEqual([...state.hours], [18, 19]);
  assert.equal(state.surface, "carpet", "values the URL doesn't mention still come from storage");
});

test("past or far-off dates in a URL fall back to the default date", () => {
  assert.equal(initialState({ search: "?date=2026-06-21", now: MORNING }).date, "2026-06-22");
  assert.equal(initialState({ search: "?date=2026-08-01", now: MORNING }).date, "2026-06-22");
  assert.equal(initialState({ search: "?date=2026-06-25", now: MORNING }).date, "2026-06-25");
});

test("buildSearch leaves out defaults so everyday URLs stay short", () => {
  const state = initialState({ now: MORNING });
  assert.equal(buildSearch(state, { date: "2026-06-22" }), "");

  state.date = "2026-06-24";
  state.venues = new Set(["BP", "CC"]);
  state.hours = new Set([19, 18]);
  state.view = "map";
  assert.equal(buildSearch(state, { date: "2026-06-22" }), "?date=2026-06-24&v=BP,CC&h=18,19&view=map");
  assert.deepEqual([...parseSearch(buildSearch(state, { date: "2026-06-22" })).venues], ["BP", "CC"]);
});
