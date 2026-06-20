const TIMES = Array.from({ length: 16 }, (_, index) =>
  `${String(index + 6).padStart(2, "0")}:00`
);

const state = {
  data: null,
  view: "grid",
  map: null,
  markerLayer: null
};

const elements = {
  date: document.querySelector("#date"),
  previousDay: document.querySelector("#previous-day"),
  nextDay: document.querySelector("#next-day"),
  location: document.querySelector("#location-filter"),
  surface: document.querySelector("#surface-filter"),
  refresh: document.querySelector("#refresh"),
  availability: document.querySelector("#availability"),
  mapView: document.querySelector("#map-view"),
  map: document.querySelector("#map"),
  freshness: document.querySelector("#freshness"),
  slotCount: document.querySelector("#slot-count"),
  courtCount: document.querySelector("#court-count"),
  bestBet: document.querySelector("#best-bet"),
  notice: document.querySelector("#notice"),
  template: document.querySelector("#location-template"),
  viewButtons: [...document.querySelectorAll(".view-button")]
};

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function setLoading(loading) {
  elements.refresh.disabled = loading;
  elements.refresh.textContent = loading ? "Loading…" : "Refresh";
  if (loading) {
    elements.availability.innerHTML =
      '<div class="loading-state">Checking All Star, LTA and ClubSpark…</div>';
  }
}

async function loadAvailability() {
  setLoading(true);
  elements.notice.hidden = true;

  try {
    const params = new URLSearchParams({ date: elements.date.value });
    const response = await fetch(`/api/availability?${params}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || data.error || "Availability request failed");

    state.data = data;
    populateLocations();
    render();

    const fetched = new Date(data.fetchedAt);
    elements.freshness.textContent = `Live · ${fetched.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;

    if (data.errors.length) {
      elements.notice.textContent = `Some locations did not answer: ${data.errors
        .map((error) => error.location)
        .join(", ")}. The rest are live.`;
      elements.notice.hidden = false;
    }
  } catch (error) {
    state.data = null;
    elements.availability.innerHTML =
      `<div class="empty-state">Couldn’t reach the booking systems.<br>${escapeHtml(error.message)}</div>`;
    elements.map.replaceChildren();
    elements.freshness.textContent = "Booking systems did not answer";
    elements.slotCount.textContent = "0";
    elements.courtCount.textContent = "0";
    elements.bestBet.textContent = "Try refresh in a moment";
  } finally {
    setLoading(false);
    if (state.data) render();
  }
}

function populateLocations() {
  const current = elements.location.value;
  elements.location.replaceChildren(new Option("All locations", "all"));

  const groups = new Map();
  for (const location of state.data.locations) {
    if (!groups.has(location.provider)) {
      const group = document.createElement("optgroup");
      group.label = location.provider;
      groups.set(location.provider, group);
      elements.location.append(group);
    }
    groups.get(location.provider).append(new Option(location.name, location.code));
  }
  elements.location.value = state.data.locations.some((location) => location.code === current)
    ? current
    : "all";
}

function visibleData() {
  if (!state.data) return { locations: [], courts: [], slots: [] };
  const locationFilter = elements.location.value;
  const surfaceFilter = elements.surface.value;
  const courts = state.data.courts.filter((court) =>
    (locationFilter === "all" || court.location === locationFilter) &&
    (surfaceFilter === "all" || court.surface === surfaceFilter)
  );
  const courtIds = new Set(courts.map((court) => court.id));

  return {
    locations: state.data.locations.filter((location) =>
      (locationFilter === "all" || location.code === locationFilter) &&
      courts.some((court) => court.location === location.code)
    ),
    courts,
    slots: state.data.slots.filter((slot) => courtIds.has(slot.courtId))
  };
}

function render() {
  if (!state.data) return;
  const visible = visibleData();
  renderGrid(visible);
  if (state.view === "map") renderMap(visible);
  updateSummary(visible.courts, visible.slots);
}

function renderGrid({ locations, courts, slots }) {
  elements.availability.replaceChildren();
  if (!locations.length) {
    elements.availability.innerHTML = '<div class="empty-state">No courts match those filters.</div>';
    return;
  }

  for (const location of locations) {
    const locationCourts = courts.filter((court) => court.location === location.code);
    const locationSlots = slots.filter((slot) => slot.location === location.code);
    const fragment = elements.template.content.cloneNode(true);
    fragment.querySelector(".location-code").textContent = location.code;
    fragment.querySelector("h2").textContent = location.name;
    fragment.querySelector(".booking-rule").textContent =
      `${location.provider} · ${location.advanceRule}`;
    fragment.querySelector(".premium-rule").textContent = location.premiumRule
      ? `Premium: ${location.premiumRule}`
      : "";
    fragment.querySelector(".pricing-rule").textContent = location.pricingRule || "";
    const statusText = location.availabilityStatus === "unavailable"
      ? "Live feed unavailable"
      : location.availabilityStatus === "outside-window"
        ? "Outside 14-day booking window"
      : location.availabilityStatus === "cached"
        ? `${locationSlots.length} open hours · cached`
        : `${locationSlots.length} open ${locationSlots.length === 1 ? "hour" : "hours"}`;
    fragment.querySelector(".location-heading p").textContent = statusText;
    if (location.statusNote) {
      fragment.querySelector(".location-heading p").title = location.statusNote;
    }
    const bookingLink = fragment.querySelector(".venue-booking-link");
    bookingLink.href = bookingUrlForDate(location, state.data.date);
    buildGrid(fragment.querySelector(".court-grid"), locationCourts, locationSlots);
    elements.availability.append(fragment);
  }
}

function bookingUrlForDate(location, date) {
  if (location.code === "BPK") return `${location.bookingUrl}#?date=${date}&role=guest`;
  if (location.provider === "LTA") return `${location.bookingUrl}?date=${date}`;
  return location.bookingUrl;
}

function buildGrid(grid, courts, slots) {
  grid.style.gridTemplateColumns = `var(--court) repeat(${TIMES.length}, var(--slot))`;
  grid.append(cell("Court", "grid-cell time-label corner"));
  TIMES.forEach((time) => grid.append(cell(time.replace(":00", ""), "grid-cell time-label")));

  const slotLookup = new Map(slots.map((slot) => [`${slot.courtId}:${slot.time}`, slot]));
  for (const court of courts) {
    const courtCell = cell("", "grid-cell court-name");
    courtCell.innerHTML = `${escapeHtml(court.name)}
      <span class="surface">${escapeHtml(court.surface)}</span>`;
    grid.append(courtCell);

    for (const time of TIMES) {
      const wrapper = cell("", "grid-cell slot-cell");
      const slot = slotLookup.get(`${court.id}:${time}`);
      if (slot) {
        const link = document.createElement("a");
        link.className = "slot-link";
        link.href = slot.bookingUrl;
        link.target = "_blank";
        link.rel = "noreferrer";
        const price = Number.isFinite(slot.price) ? ` · £${formatPrice(slot.price)}` : "";
        const memberPrice = Number.isFinite(slot.memberPrice)
          ? ` · Member Plus £${formatPrice(slot.memberPrice)}`
          : "";
        const period = slot.pricePeriod ? ` · ${slot.pricePeriod}` : "";
        const access = slot.premiumOnly ? " · Member Plus only" : "";
        const note = slot.pricingNote ? ` · ${slot.pricingNote}` : "";
        link.classList.toggle("premium-slot", Boolean(slot.premiumOnly));
        link.textContent = `Book ${court.name} at ${time}${price}${memberPrice}${period}${access}${note}`;
        link.title = `Book ${time}${price}${memberPrice}${period}${access}${note}`;
        wrapper.append(link);
      }
      grid.append(wrapper);
    }
  }
}

function renderMap({ locations, courts, slots }) {
  if (!locations.length) return;

  if (!window.L) {
    elements.map.innerHTML =
      '<div class="map-error">Map tiles could not load. Check your connection and refresh.</div>';
    return;
  }

  if (!state.map) {
    state.map = L.map(elements.map, {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView([51.449, -0.151], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(state.map);
    state.markerLayer = L.layerGroup().addTo(state.map);
  }

  state.markerLayer.clearLayers();
  const slotCounts = new Map();
  for (const slot of slots) {
    slotCounts.set(slot.location, (slotCounts.get(slot.location) || 0) + 1);
  }
  const bounds = [];

  for (const location of locations) {
    const count = slotCounts.get(location.code) || 0;
    const courtCount = courts.filter((court) => court.location === location.code).length;
    const icon = L.divIcon({
      className: "venue-marker-shell",
      html: `<span class="venue-marker ${count ? "has-slots" : "no-slots"}">
        <strong>${escapeHtml(location.code)}</strong>
        <small>${count}</small>
      </span>`,
      iconSize: [46, 54],
      iconAnchor: [23, 52],
      popupAnchor: [0, -48]
    });
    const marker = L.marker([location.lat, location.lng], {
      icon,
      title: location.name,
      alt: `${location.name}, ${count} open hours`
    });
    const popup = document.createElement("div");
    popup.className = "venue-popup";
    popup.innerHTML = `
      <strong>${escapeHtml(location.name)}</strong>
      <span>${count} open ${count === 1 ? "hour" : "hours"} · ${courtCount} courts</span>
      <span>${escapeHtml(location.advanceRule)}</span>
    `;
    const viewButton = document.createElement("button");
    viewButton.type = "button";
    viewButton.textContent = "View court grid";
    viewButton.addEventListener("click", () => focusLocation(location.code));
    popup.append(viewButton);
    marker.bindPopup(popup);
    marker.addTo(state.markerLayer);
    bounds.push([location.lat, location.lng]);
  }

  if (bounds.length === 1) {
    state.map.setView(bounds[0], 15);
  } else if (bounds.length > 1) {
    state.map.fitBounds(bounds, { padding: [42, 42], maxZoom: 14 });
  }
  requestAnimationFrame(() => state.map.invalidateSize());
}

function focusLocation(code) {
  elements.location.value = code;
  setView("grid");
  render();
  document.querySelector(".location-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setView(view) {
  state.view = view;
  elements.availability.hidden = view !== "grid";
  elements.mapView.hidden = view !== "map";
  elements.availability.style.display = view === "grid" ? "grid" : "none";
  elements.mapView.style.display = view === "map" ? "block" : "none";
  elements.viewButtons.forEach((button) =>
    button.classList.toggle("active", button.dataset.view === view)
  );
  if (view === "map" && state.data) {
    renderMap(visibleData());
    requestAnimationFrame(() => state.map?.invalidateSize());
  }
}

function cell(text, className) {
  const element = document.createElement("div");
  element.className = className;
  element.textContent = text;
  return element;
}

function updateSummary(courts, slots) {
  const availableCourtIds = new Set(slots.map((slot) => slot.courtId));
  elements.slotCount.textContent = slots.length;
  elements.courtCount.textContent = availableCourtIds.size;

  const byLocation = new Map();
  for (const slot of slots) {
    byLocation.set(slot.location, (byLocation.get(slot.location) || 0) + 1);
  }
  const best = [...byLocation.entries()].sort((a, b) => b[1] - a[1])[0];
  const location = best && state.data.locations.find((item) => item.code === best[0]);
  elements.bestBet.textContent = location
    ? `Best bet: ${location.name} · ${best[1]} openings`
    : courts.length ? "Nothing open on this date" : "No matching courts";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function formatPrice(value) {
  return Number(value).toFixed(2).replace(/\.00$/, "");
}

elements.date.value = addDays(localDateString(), 1);
elements.previousDay.addEventListener("click", () => {
  elements.date.value = addDays(elements.date.value, -1);
  loadAvailability();
});
elements.nextDay.addEventListener("click", () => {
  elements.date.value = addDays(elements.date.value, 1);
  loadAvailability();
});
elements.date.addEventListener("change", loadAvailability);
elements.refresh.addEventListener("click", loadAvailability);
elements.location.addEventListener("change", render);
elements.surface.addEventListener("change", render);
elements.viewButtons.forEach((button) =>
  button.addEventListener("click", () => setView(button.dataset.view))
);

setView("grid");
loadAvailability();
