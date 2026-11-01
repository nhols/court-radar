import { VENUES } from "../shared/venues.js";
import { addDays, daysBetween, londonHour, londonToday } from "../shared/dates.js";
import { buildSearch, defaultDate, initialState, isSelectableDate, writeStored } from "./prefs.js";
import { MAX_AGE_MS, loadVenue } from "./loader.js";
import { buildGrid, surfacesIn } from "./model.js";
import { attachGridInteractions, renderGrid, revealVenue, scrollToHour } from "./grid.js";
import { createControls } from "./controls.js";
import { renderMap } from "./map.js";


const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
})();

const state = initialState({ search: location.search, storage });
const results = new Map();
const pending = new Set();
let position = null;
let renderQueued = false;
let scrolledFor = null;
let hasRendered = false;

const elements = {
  grid: document.querySelector("#grid-view"),
  mapView: document.querySelector("#map-view"),
  map: document.querySelector("#map"),
  tooltip: document.querySelector("#tooltip"),
  freshness: document.querySelector("#freshness"),
  notice: document.querySelector("#notice"),
  refresh: document.querySelector("#refresh"),
  share: document.querySelector("#share"),
  app: document.querySelector(".app")
};

function today() {
  return londonToday();
}

function pastBefore() {
  return state.date === today() ? londonHour() : -1;
}

// Saves to localStorage whenever the viewer changes something. Opening a page
// saves nothing, so a shared link doesn't overwrite the viewer's own choices.
function commit({ remember = true } = {}) {
  if (remember) writeStored(storage, state);
  const search = buildSearch(state, { date: defaultDate() });
  if (search !== location.search) history.replaceState(null, "", `${location.pathname}${search}`);
  scheduleRender();
}

function load({ force = false, codes = state.venues } = {}) {
  const date = state.date;
  for (const code of codes) {
    const current = results.get(code);
    if (!force && current && current.status !== "error") continue;
    // A refresh keeps the current answer on screen until the new one lands.
    if (!current || current.status === "error") results.set(code, { status: "loading" });
    const key = `${date}/${code}`;
    pending.add(key);
    loadVenue(code, date, { force }).then((result) => {
      pending.delete(key);
      if (state.date !== date) return;
      const unchanged = sameAvailability(results.get(code), result);
      results.set(code, result);
      if (unchanged) renderFreshness();
      else scheduleRender();
    });
  }
  scheduleRender();
}

// A background refresh that changes nothing shouldn't redraw the grid under the pointer.
function sameAvailability(before, after) {
  if (!before || before.status !== after.status) return false;
  const key = (result) => JSON.stringify([result.courts, result.slots, result.note, result.bookableFrom]);
  return key(before) === key(after);
}

function pendingCount() {
  return [...pending].filter((key) => key.startsWith(`${state.date}/`)).length;
}

function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  // A timer rather than requestAnimationFrame, which never fires in background tabs.
  setTimeout(() => {
    renderQueued = false;
    render();
  }, 0);
}

function render() {
  const model = buildGrid({
    selected: state.venues,
    results,
    surface: state.surface,
    hours: state.hours,
    match: state.match,
    hideFull: state.hideFull,
    sort: state.sort,
    position: state.sort === "near" ? position : null,
    pastBefore: pastBefore()
  });

  controls.update(state, { today: today(), surfaces: surfacesIn(results, state.venues) });
  renderFreshness();

  elements.grid.hidden = state.view !== "grid";
  elements.mapView.hidden = state.view !== "map";

  if (state.view === "grid") {
    renderGrid(elements.grid, model, {
      date: state.date,
      hours: state.hours,
      collapsed: state.collapsed,
      allCollapsed: state.collapsed.size > 0,
      pastBefore: pastBefore(),
      surface: state.surface
    });
    autoScroll(model);
  } else {
    renderMap(elements.map, model, {
      selected: state.venues,
      onShowVenue: showVenueInGrid,
      onToggleVenue: toggleVenue
    });
  }
  hasRendered = true;
}

// Bring the useful hours into view once per date: the chosen hours, or now.
function autoScroll(model) {
  const key = `${state.date}|${[...state.hours].join(",")}`;
  if (scrolledFor === key || !model.sections.some((section) => section.status === "live")) return;
  scrolledFor = key;
  const target = state.hours.size ? Math.min(...state.hours) : pastBefore() > 0 ? pastBefore() : null;
  if (target != null) scrollToHour(elements.grid, Math.max(model.columns[0], target - 1));
  else elements.grid.scrollLeft = 0;
}

function renderFreshness() {
  const selected = [...state.venues].map((code) => results.get(code)).filter(Boolean);
  const fetched = selected.map((result) => Date.parse(result.fetchedAt)).filter(Number.isFinite);
  const loading = pendingCount();
  const errors = selected.filter((result) => result.status === "error").length;
  elements.refresh.classList.toggle("spinning", loading > 0);
  if (!fetched.length) {
    elements.freshness.textContent = loading ? "Checking courts…" : "Nothing loaded";
    return;
  }
  const minutes = Math.floor((Date.now() - Math.min(...fetched)) / 60_000);
  const age = minutes < 1 ? "just now" : `${minutes} min ago`;
  const extra = loading ? ` · ${loading} loading` : errors ? ` · ${errors} not answering` : "";
  elements.freshness.textContent = `Updated ${age}${extra}`;
  elements.freshness.parentElement.title = elements.freshness.textContent;
}

function showNotice(message) {
  elements.notice.textContent = message;
  elements.notice.hidden = false;
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => {
    elements.notice.hidden = true;
  }, 4000);
}

function setDate(date) {
  if (!isSelectableDate(date, today()) || date === state.date) return;
  state.date = date;
  results.clear();
  load();
  commit();
}

function toggleVenue(code, on) {
  if (on) state.venues.add(code);
  else state.venues.delete(code);
  if (on) load({ codes: [code] });
  commit();
}

function showVenueInGrid(code) {
  state.view = "grid";
  state.collapsed.delete(code);
  commit();
  setTimeout(() => revealVenue(elements.grid, code), 50);
}

function requestPosition() {
  if (!navigator.geolocation) {
    showNotice("This browser can't share your location, so venues stay in list order.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => {
      position = { lat: coords.latitude, lng: coords.longitude };
      scheduleRender();
    },
    () => showNotice("Couldn't get your location, so venues stay in list order."),
    { maximumAge: 10 * 60_000, timeout: 10_000 }
  );
}

const actions = {
  setDate,
  toggleVenue,
  setVenuePreset(preset) {
    const codes = preset === "all"
      ? VENUES.map((venue) => venue.code)
      : [];
    state.venues = new Set(codes);
    load();
    commit();
  },
  setHours(hours) {
    state.hours = new Set(hours);
    commit();
  },
  toggleHour(hour) {
    if (state.hours.has(hour)) state.hours.delete(hour);
    else state.hours.add(hour);
    commit();
  },
  toggleFilters() {
    state.filtersOpen = !state.filtersOpen;
    commit();
  },
  toggleHideFull() {
    state.hideFull = !state.hideFull;
    commit();
  },
  setMatch(match) {
    state.match = match;
    commit();
  },
  setSurface(surface) {
    state.surface = surface;
    commit();
  },
  setSort(sort) {
    state.sort = sort;
    if (sort === "near" && !position) requestPosition();
    commit();
  },
  setView(view) {
    state.view = view;
    commit();
  }
};

const controls = createControls(actions);

attachGridInteractions(elements.grid, elements.tooltip, (action, data) => {
  if (action === "toggle-hour") actions.toggleHour(Number(data.hour));
  if (action === "choose-venues") {
    // The venue picker lives in the filter panel, so roll that down first.
    if (state.filtersOpen) {
      controls.openVenues();
    } else {
      state.filtersOpen = true;
      commit();
      setTimeout(() => controls.openVenues(), 400);
    }
  }
  if (action === "collapse-all") {
    state.collapsed = state.collapsed.size ? new Set() : new Set(state.venues);
    commit();
  }
  if (action === "retry") load({ codes: [data.venue], force: true });
  if (action === "collapse") {
    if (state.collapsed.has(data.venue)) state.collapsed.delete(data.venue);
    else state.collapsed.add(data.venue);
    commit();
  }
});

elements.refresh.addEventListener("click", () => load({ force: true }));
elements.share.addEventListener("click", async () => {
  const url = new URL(location.href);
  if (!url.searchParams.has("date")) url.searchParams.set("date", state.date);
  try {
    await navigator.clipboard.writeText(url.toString().replaceAll("%2C", ","));
    showNotice("Link copied. It opens on this date with these venues and hours.");
  } catch {
    showNotice(url.toString());
  }
});

// Keyboard: [ and ] step through days when nothing editable has focus.
document.addEventListener("keydown", (event) => {
  if (event.target.closest("input, select, textarea") || event.metaKey || event.ctrlKey) return;
  if (event.key === "[" || event.key === "]") {
    setDate(addDays(state.date, event.key === "]" ? 1 : -1));
  }
});

// Courts get booked quickly, so anything over a minute old is fetched again
// while the page is on screen, and as soon as a background tab comes back.
function refreshStale() {
  if (document.visibilityState !== "visible" || !hasRendered) return;
  if (daysBetween(today(), state.date) < 0) {
    setDate(defaultDate());
    return;
  }
  const stale = [...state.venues].filter((code) => {
    const fetchedAt = Date.parse(results.get(code)?.fetchedAt);
    return Number.isFinite(fetchedAt) && Date.now() - fetchedAt >= MAX_AGE_MS;
  });
  if (stale.length) load({ codes: stale, force: true });
}
document.addEventListener("visibilitychange", refreshStale);

// On phones the bar slides away while scrolling down the grid and
// comes back on the way up, so the grid gets the whole screen.
const phone = window.matchMedia("(max-width: 640px)");
let lastScrollTop = 0;
elements.grid.addEventListener("scroll", () => {
  const top = elements.grid.scrollTop;
  if (phone.matches) {
    if (top > lastScrollTop + 8 && top > 60) elements.app.classList.add("bar-hidden");
    else if (top < lastScrollTop - 8 || top < 20) elements.app.classList.remove("bar-hidden");
  } else {
    elements.app.classList.remove("bar-hidden");
  }
  lastScrollTop = top;
}, { passive: true });
setInterval(refreshStale, 15_000);
setInterval(renderFreshness, 15_000);

if (state.sort === "near") requestPosition();
load();
commit({ remember: false });

// Installable app: the service worker keeps the app itself working offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
