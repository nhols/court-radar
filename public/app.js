const TIMES = Array.from({ length: 16 }, (_, index) =>
  `${String(index + 6).padStart(2, "0")}:00`
);

const state = {
  data: null,
  view: "grid",
  map: null,
  markerLayer: null,
  selectedLocationCodes: new Set()
};

const elements = {
  date: document.querySelector("#date"),
  previousDay: document.querySelector("#previous-day"),
  nextDay: document.querySelector("#next-day"),
  locationFilter: document.querySelector(".location-multiselect"),
  locationFilterLabel: document.querySelector("#location-filter-label"),
  locationFilterOptions: document.querySelector("#location-filter-options"),
  surface: document.querySelector("#surface-filter"),
  refresh: document.querySelector("#refresh"),
  batterseaDialog: document.querySelector("#battersea-import-dialog"),
  batterseaJsonLink: document.querySelector("#open-battersea-json"),
  batterseaImportDate: document.querySelector("#battersea-import-date"),
  batterseaJson: document.querySelector("#battersea-json"),
  batterseaImport: document.querySelector("#import-battersea-json"),
  batterseaImportStatus: document.querySelector("#battersea-import-status"),
  availability: document.querySelector("#availability"),
  mapView: document.querySelector("#map-view"),
  map: document.querySelector("#map"),
  freshness: document.querySelector("#freshness"),
  slotCount: document.querySelector("#slot-count"),
  courtCount: document.querySelector("#court-count"),
  bestBet: document.querySelector("#best-bet"),
  notice: document.querySelector("#notice"),
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

function showNotice(message, tone = "warning") {
  elements.notice.textContent = message;
  elements.notice.dataset.tone = tone;
  elements.notice.hidden = false;
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
      showNotice(`Some locations did not answer: ${data.errors
        .map((error) => error.location)
        .join(", ")}. The rest are live.`);
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

function openBatterseaImport() {
  const date = elements.date.value;
  elements.batterseaJsonLink.href = BatterseaImport.endpointForDate(date);
  elements.batterseaImportDate.textContent = date;
  elements.batterseaJson.value = "";
  elements.batterseaImportStatus.textContent = "";
  elements.batterseaImportStatus.dataset.tone = "";
  elements.batterseaDialog.showModal();
}

function importBattersea() {
  if (!state.data) {
    elements.batterseaImportStatus.textContent =
      "Load the main availability first, then import Battersea.";
    elements.batterseaImportStatus.dataset.tone = "error";
    return;
  }

  try {
    const result = BatterseaImport.importText(
      elements.batterseaJson.value,
      elements.date.value
    );
    state.data = BatterseaImport.mergeIntoAvailability(state.data, result);
    populateLocations();
    render();
    elements.batterseaDialog.close();
    elements.freshness.textContent = "Live · Battersea imported just now";
    showNotice(
      `Battersea imported for ${elements.date.value}: ${result.slots.length} open court-hours.`,
      "success"
    );
  } catch (error) {
    elements.batterseaImportStatus.textContent = error.message;
    elements.batterseaImportStatus.dataset.tone = "error";
  }
}

function populateLocations() {
  const validCodes = new Set(state.data.locations.map((location) => location.code));
  state.selectedLocationCodes = new Set(
    [...state.selectedLocationCodes].filter((code) => validCodes.has(code))
  );
  elements.locationFilterOptions.replaceChildren();

  const allLabel = document.createElement("label");
  allLabel.className = "multi-select-all";
  allLabel.innerHTML = '<input type="checkbox" value="all"> <span>All locations</span>';
  elements.locationFilterOptions.append(allLabel);

  const providers = new Map();
  for (const location of state.data.locations) {
    if (!providers.has(location.provider)) providers.set(location.provider, []);
    providers.get(location.provider).push(location);
  }
  for (const [provider, locations] of providers) {
    const group = document.createElement("fieldset");
    const legend = document.createElement("legend");
    legend.textContent = provider;
    group.append(legend);
    for (const location of locations) {
      const label = document.createElement("label");
      label.innerHTML = `<input type="checkbox" value="${escapeHtml(location.code)}">
        <span>${escapeHtml(location.name)}</span>`;
      group.append(label);
    }
    elements.locationFilterOptions.append(group);
  }
  updateLocationFilter();
}

function updateLocationFilter() {
  const count = state.selectedLocationCodes.size;
  elements.locationFilterLabel.textContent = count
    ? `${count} ${count === 1 ? "location" : "locations"}`
    : "All locations";
  const all = elements.locationFilterOptions.querySelector('input[value="all"]');
  if (all) all.checked = count === 0;
  elements.locationFilterOptions.querySelectorAll('input:not([value="all"])')
    .forEach((input) => {
      input.checked = state.selectedLocationCodes.has(input.value);
    });
}

function visibleData() {
  if (!state.data) return { locations: [], courts: [], slots: [] };
  const surfaceFilter = elements.surface.value;
  const courts = state.data.courts.filter((court) =>
    (!state.selectedLocationCodes.size || state.selectedLocationCodes.has(court.location)) &&
    (surfaceFilter === "all" || court.surface === surfaceFilter)
  );
  const courtIds = new Set(courts.map((court) => court.id));

  return {
    locations: state.data.locations.filter((location) =>
      (!state.selectedLocationCodes.size || state.selectedLocationCodes.has(location.code)) &&
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

  const card = document.createElement("section");
  card.className = "continuous-card";
  card.append(buildProviderRules(locations));
  const scroller = document.createElement("div");
  scroller.className = "grid-scroller";
  const grid = document.createElement("div");
  grid.className = "court-grid continuous-grid";
  grid.style.gridTemplateColumns =
    `var(--location) var(--court) repeat(${TIMES.length}, var(--slot))`;

  const slotLookup = new Map(slots.map((slot) => [`${slot.courtId}:${slot.time}`, slot]));
  const courtTotals = new Map();
  const timeTotals = new Map(TIMES.map((time) => [time, 0]));
  for (const slot of slots) {
    courtTotals.set(slot.courtId, (courtTotals.get(slot.courtId) || 0) + 1);
    timeTotals.set(slot.time, (timeTotals.get(slot.time) || 0) + 1);
  }

  const locationHeader = positionedCell("Location", "grid-cell time-label location-corner", 1, 1);
  const courtHeader = positionedCell("Court", "grid-cell time-label court-corner", 2, 1);
  grid.append(locationHeader, courtHeader);
  TIMES.forEach((time, index) => {
    const header = positionedCell(time.replace(":00", ""), "grid-cell time-label", index + 3, 1);
    header.dataset.hoverInfo = "true";
    header.dataset.time = time;
    header.dataset.columnTotal = timeTotals.get(time) || 0;
    grid.append(header);
  });

  let gridRow = 2;

  locations.forEach((location, locationIndex) => {
    const locationCourts = courts.filter((court) => court.location === location.code);
    const locationSlots = slots.filter((slot) => slot.location === location.code);
    const dividerClass = locationIndex > 0 ? " group-divider" : "";
    const statusText = location.availabilityStatus === "unavailable"
      ? "Live feed unavailable"
      : location.availabilityStatus === "outside-window"
        ? "Outside 14-day booking window"
      : location.availabilityStatus === "cached"
        ? `${locationSlots.length} open hours · cached`
        : location.availabilityStatus === "imported"
          ? `${locationSlots.length} open hours · manually imported`
        : `${locationSlots.length} open ${locationSlots.length === 1 ? "hour" : "hours"}`;

    const locationCell = positionedCell(
      "",
      `grid-cell location-info${dividerClass}`,
      1,
      gridRow
    );
    locationCell.style.gridRowEnd = `span ${locationCourts.length}`;
    locationCell.dataset.locationCode = location.code;
    locationCell.innerHTML = `
      ${providerMark(location.provider)}
      <div class="location-copy">
        <h2>${escapeHtml(location.name)}</h2>
        ${location.pricingRule
          ? `<span class="pricing-rule">${escapeHtml(location.pricingRule)}</span>`
          : ""}
        <span class="location-status">
          ${escapeHtml(statusText)}
          ${location.code === "BPK" && location.availabilityStatus === "unavailable"
            ? '<button class="inline-import-button" data-import-battersea type="button">Import Battersea</button>'
            : ""}
        </span>
        <a class="venue-booking-link" href="${escapeHtml(bookingUrlForDate(location, state.data.date))}"
          target="_blank" rel="noreferrer">Booking site ↗</a>
      </div>
    `;
    if (location.statusNote) locationCell.title = location.statusNote;
    grid.append(locationCell);

    locationCourts.forEach((court, courtIndex) => {
      const row = gridRow + courtIndex;
      const rowDivider = locationIndex > 0 && courtIndex === 0 ? " group-divider" : "";
      const courtCell = positionedCell(
        "",
        `grid-cell court-name${rowDivider}`,
        2,
        row
      );
      courtCell.innerHTML = `${escapeHtml(court.name)}
        <span class="surface">${escapeHtml(court.surface)}</span>`;
      setHoverInfo(courtCell, {
        location,
        court,
        rowTotal: courtTotals.get(court.id) || 0
      });
      grid.append(courtCell);

      TIMES.forEach((time, timeIndex) => {
        const wrapper = positionedCell(
          "",
          `grid-cell slot-cell${rowDivider}`,
          timeIndex + 3,
          row
        );
        const slot = slotLookup.get(`${court.id}:${time}`);
        setHoverInfo(wrapper, {
          location,
          court,
          time,
          slot,
          rowTotal: courtTotals.get(court.id) || 0,
          columnTotal: timeTotals.get(time) || 0
        });
        if (slot) wrapper.append(buildSlotLink(slot, court, time));
        grid.append(wrapper);
      });
    });

    gridRow += locationCourts.length;
  });

  scroller.append(grid);
  card.append(scroller);
  elements.availability.append(card);
  setupGridHover(grid);
}

function buildProviderRules(locations) {
  const panel = document.createElement("aside");
  panel.className = "provider-rules";
  panel.setAttribute("aria-label", "Booking rules by provider");
  panel.innerHTML = '<span class="provider-rules-title">Booking windows</span>';

  const providers = new Map();
  for (const location of locations) {
    if (!providers.has(location.provider)) providers.set(location.provider, location);
  }

  for (const location of providers.values()) {
    const rule = document.createElement("div");
    rule.className = "provider-rule";
    rule.innerHTML = `
      ${providerMark(location.provider)}
      <div>
        <strong>${escapeHtml(location.provider)}</strong>
        <span>${escapeHtml(location.advanceRule)}</span>
        ${location.premiumRule
          ? `<span class="premium-rule">Premium: ${escapeHtml(location.premiumRule)}</span>`
          : ""}
      </div>
    `;
    panel.append(rule);
  }
  return panel;
}

function providerMark(provider) {
  const marks = {
    "All Star": {
      label: "All Star",
      iconUrl: "https://allstartennis.co.uk/wp-content/uploads/2021/02/cropped-Favicon-192x192.png"
    },
    LTA: {
      label: "LTA",
      iconUrl: "https://www.lta.org.uk/apple-touch-icon.png"
    },
    ClubSpark: {
      label: "ClubSpark",
      iconUrl: "https://cdn.prod.website-files.com/5913419a4c015d52d21dde03/63fd345e95e28f4b4832dde4_CS-23-icon.png"
    }
  };
  const { label, iconUrl } = marks[provider] || marks.LTA;
  return `<span class="provider-mark" title="${escapeHtml(label)}">
    <img src="${iconUrl}" alt="${escapeHtml(label)} symbol" loading="lazy" referrerpolicy="no-referrer">
  </span>`;
}

function bookingUrlForDate(location, date) {
  if (location.code === "BPK") return `${location.bookingUrl}#?date=${date}&role=guest`;
  if (location.provider === "LTA") return `${location.bookingUrl}?date=${date}`;
  return location.bookingUrl;
}

function buildSlotLink(slot, court, time) {
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
  link.setAttribute("aria-label", `Book ${time}${price}${memberPrice}${period}${access}${note}`);
  return link;
}

function setHoverInfo(
  cell,
  { location, court, time = "", slot = null, rowTotal = 0, columnTotal = 0 }
) {
  cell.dataset.hoverInfo = "true";
  cell.dataset.locationName = location.name;
  cell.dataset.provider = location.provider;
  cell.dataset.courtName = court.name;
  cell.dataset.surface = court.surface;
  cell.dataset.rowTotal = rowTotal;
  if (!time) return;

  cell.dataset.time = time;
  cell.dataset.columnTotal = columnTotal;
  if (slot) {
    cell.dataset.availability = slot.premiumOnly ? "Available to Member Plus" : "Available";
    const details = [];
    if (Number.isFinite(slot.price)) details.push(`Public £${formatPrice(slot.price)}`);
    if (Number.isFinite(slot.memberPrice)) {
      details.push(`Member Plus £${formatPrice(slot.memberPrice)}`);
    }
    if (slot.pricePeriod) details.push(slot.pricePeriod);
    if (slot.pricingNote) details.push(slot.pricingNote);
    cell.dataset.details = details.join(" · ");
  } else if (location.availabilityStatus === "unavailable") {
    cell.dataset.availability = "Live feed unavailable";
  } else if (location.availabilityStatus === "outside-window") {
    cell.dataset.availability = "Outside booking window";
  } else {
    cell.dataset.availability = "Not available";
  }
}

function setupGridHover(grid) {
  let tooltip = document.querySelector("#grid-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "grid-tooltip";
    tooltip.className = "grid-tooltip";
    tooltip.setAttribute("role", "status");
    tooltip.hidden = true;
    document.body.append(tooltip);
  }

  const clearHighlight = () => {
    grid.querySelectorAll(".is-row-highlighted, .is-column-highlighted, .is-hovered")
      .forEach((cell) =>
        cell.classList.remove("is-row-highlighted", "is-column-highlighted", "is-hovered")
      );
    tooltip.hidden = true;
  };

  const positionTooltip = (x, y) => {
    const gap = 14;
    const bounds = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.max(10, Math.min(x + gap, window.innerWidth - bounds.width - 10))}px`;
    const below = y + gap;
    tooltip.style.top = `${below + bounds.height > window.innerHeight
      ? Math.max(10, y - bounds.height - gap)
      : below}px`;
  };

  const showTooltip = (cell, event) => {
    const row = cell.dataset.gridRow;
    const column = cell.dataset.gridColumn;
    if (row && row !== "1") {
      grid.querySelectorAll(`[data-grid-row="${row}"]:not(.location-info)`)
        .forEach((item) => item.classList.add("is-row-highlighted"));
    }
    if (column && column !== "1" && column !== "2") {
      grid.querySelectorAll(`[data-grid-column="${column}"]`)
        .forEach((item) => item.classList.add("is-column-highlighted"));
    }
    cell.classList.add("is-hovered");

    const heading = cell.dataset.courtName && cell.dataset.time
      ? `${cell.dataset.courtName} · ${cell.dataset.time}`
      : cell.dataset.courtName || `${cell.dataset.time} across all courts`;
    const context = cell.dataset.locationName
      ? `${cell.dataset.locationName} · ${cell.dataset.surface} · ${cell.dataset.provider}`
      : "Availability by hour";
    tooltip.replaceChildren();
    const strong = document.createElement("strong");
    strong.textContent = heading;
    const meta = document.createElement("span");
    meta.textContent = context;
    tooltip.append(strong, meta);
    if (cell.dataset.availability) {
      const availability = document.createElement("span");
      availability.className = cell.querySelector(".slot-link") ? "available" : "unavailable";
      availability.textContent = cell.dataset.availability;
      tooltip.append(availability);
    }
    if (cell.dataset.details) {
      const details = document.createElement("span");
      details.textContent = cell.dataset.details;
      tooltip.append(details);
    }
    const totals = [];
    if (cell.dataset.rowTotal !== undefined) {
      const count = Number(cell.dataset.rowTotal);
      totals.push(`${cell.dataset.courtName}: ${count} open ${count === 1 ? "hour" : "hours"}`);
    }
    if (cell.dataset.columnTotal !== undefined) {
      const count = Number(cell.dataset.columnTotal);
      totals.push(`${cell.dataset.time}: ${count} open court-${count === 1 ? "hour" : "hours"}`);
    }
    if (totals.length) {
      const total = document.createElement("span");
      total.className = "hover-totals";
      total.textContent = totals.join(" · ");
      tooltip.append(total);
    }
    tooltip.hidden = false;

    if (event?.clientX) {
      positionTooltip(event.clientX, event.clientY);
    } else {
      const bounds = cell.getBoundingClientRect();
      positionTooltip(bounds.right, bounds.top + bounds.height / 2);
    }
  };

  grid.addEventListener("pointerover", (event) => {
    const cell = event.target.closest(".grid-cell[data-hover-info]");
    if (!cell || !grid.contains(cell)) return;
    clearHighlight();
    showTooltip(cell, event);
  });
  grid.addEventListener("pointermove", (event) => {
    if (!tooltip.hidden) positionTooltip(event.clientX, event.clientY);
  });
  grid.addEventListener("pointerleave", clearHighlight);
  grid.addEventListener("focusin", (event) => {
    const cell = event.target.closest(".grid-cell[data-hover-info]");
    if (!cell) return;
    clearHighlight();
    showTooltip(cell);
  });
  grid.addEventListener("focusout", clearHighlight);
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
  state.selectedLocationCodes = new Set([code]);
  updateLocationFilter();
  setView("grid");
  render();
  document.querySelector(`[data-location-code="${CSS.escape(code)}"]`)
    ?.scrollIntoView({ behavior: "smooth", block: "center", inline: "start" });
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

function positionedCell(text, className, column, row) {
  const element = cell(text, className);
  element.style.gridColumn = column;
  element.style.gridRow = row;
  element.dataset.gridColumn = column;
  element.dataset.gridRow = row;
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
elements.batterseaImport.addEventListener("click", importBattersea);
elements.availability.addEventListener("click", (event) => {
  if (event.target.closest("[data-import-battersea]")) openBatterseaImport();
});
elements.locationFilterOptions.addEventListener("change", (event) => {
  const input = event.target.closest('input[type="checkbox"]');
  if (!input) return;
  if (input.value === "all") {
    state.selectedLocationCodes.clear();
  } else if (input.checked) {
    state.selectedLocationCodes.add(input.value);
  } else {
    state.selectedLocationCodes.delete(input.value);
  }
  updateLocationFilter();
  render();
});
elements.surface.addEventListener("change", render);
elements.viewButtons.forEach((button) =>
  button.addEventListener("click", () => setView(button.dataset.view))
);

setView("grid");
loadAvailability();
