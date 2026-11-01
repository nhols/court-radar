// The availability grid: one table, one row group per venue, a sticky hour
// header and court column. Every free hour is its own square.

import { SOURCES, bookingUrlForDate, googleMapsUrl } from "../shared/venues.js";
import { formatDay, hourLabel } from "../shared/dates.js";
import { capitalise, escapeHtml, formatPrice, plural } from "./html.js";

let cellInfo = new Map();

function slotKey(venue, courtId, hour) {
  return `${venue}|${courtId}|${hour}`;
}

function priceText(slot) {
  const parts = [];
  if (Number.isFinite(slot.memberPrice)) {
    parts.push(`Public ${formatPrice(slot.price)}`, `Member Plus ${formatPrice(slot.memberPrice)}`);
  } else if (Number.isFinite(slot.price)) {
    parts.push(formatPrice(slot.price));
  }
  if (slot.period) parts.push(slot.period);
  return parts.join(" · ");
}

function venueStatus(section) {
  const { result, venue } = section;
  switch (section.status) {
    case "loading":
      return '<span class="status status-loading">Checking…</span>';
    case "error":
      return `<span class="status status-error">Didn't answer · ${escapeHtml(result.error || "unknown error")}</span>
        <button class="text-button" type="button" data-action="retry" data-venue="${venue.code}">Retry</button>`;
    case "outside-window":
      return `<span class="status status-later">Bookings open ${escapeHtml(formatDay(result.bookableFrom))}${
        venue.source === "mindbody" ? " for Member Plus" : ""}</span>`;
    case "closed":
      return `<span class="status status-later">${escapeHtml(result.note)}</span>`;
    // Member Plus-only slots are shown by their pale orange cells, so the
    // venue row doesn't repeat it.
    default:
      return section.courts.length
        ? `<span class="status">${plural(section.free, "open hour")}</span>`
        : '<span class="status">No courts listed</span>';
  }
}

function venueHead(section, { columnCount, date, collapsed }) {
  const { venue } = section;
  const distance = section.distance == null ? "" : ` · ${section.distance.toFixed(1)} km`;
  const canCollapse = section.status === "live" && section.courts.length > 0;
  return `<tr class="venue-row"><th colspan="${columnCount + 1}" scope="rowgroup">
    <div class="venue-head">
      ${canCollapse
        ? `<button class="collapse" type="button" data-action="collapse" data-venue="${venue.code}"
            aria-expanded="${!collapsed}" aria-label="${collapsed ? "Show" : "Hide"} courts at ${escapeHtml(venue.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button>`
        : '<span class="collapse-spacer"></span>'}
      <span class="badge badge-${venue.source}" title="${escapeHtml(venue.group)}">${escapeHtml(SOURCES[venue.source].short)}</span>
      <div class="venue-title">
        <h2 title="${escapeHtml(`${venue.group} · ${venue.rules}`)}">${escapeHtml(venue.name)}</h2>
        <p class="venue-meta">${venueStatus(section)}<span class="rules">${escapeHtml(venue.rules)}${distance}</span></p>
      </div>
      <a class="book-link" href="${escapeHtml(googleMapsUrl(venue))}" target="_blank" rel="noreferrer"
        title="Open in Google Maps" aria-label="Open ${escapeHtml(venue.name)} in Google Maps">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </a>
      <a class="book-link" href="${escapeHtml(bookingUrlForDate(venue, date))}" target="_blank" rel="noreferrer"
        title="Open the booking site" aria-label="Open the ${escapeHtml(venue.name)} booking site">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>
      </a>
    </div>
  </th></tr>`;
}

function courtRow(section, row, columns, { hours, pastBefore, date, columnTotals }) {
  const { venue } = section;
  const rowTotal = row.slots.size;
  const cells = columns.map((hour) => {
    const slot = row.slots.get(hour);
    const classes = ["slot-cell"];
    if (hours.has(hour)) classes.push("is-selected-time");
    if (hour < pastBefore) classes.push("past");
    cellInfo.set(slotKey(venue.code, row.court.id, hour), {
      venue,
      court: row.court,
      slot,
      rowTotal,
      columnTotal: columnTotals.get(hour) || 0
    });
    const attrs = `data-hour="${hour}" data-venue="${venue.code}" data-court="${escapeHtml(row.court.id)}"`;
    if (!slot) return `<td class="${classes.join(" ")}" ${attrs}></td>`;

    const label = `Book ${row.court.name} at ${venue.name}, ${formatDay(date)} ${slot.time}${
      slot.memberOnly ? ", Member Plus only" : ""}${priceText(slot) ? `, ${priceText(slot)}` : ""}`;
    return `<td class="${classes.join(" ")}" ${attrs}><a class="slot-link${slot.memberOnly ? " premium-slot" : ""}"
      href="${escapeHtml(slot.bookingUrl)}" target="_blank" rel="noreferrer" aria-label="${escapeHtml(label)}"></a></td>`;
  }).join("");

  // Court labels are shortened to "1 H"; the full name and surface are in the hover text.
  const shortName = row.court.name.match(/\d+/)?.[0] ?? row.court.name.slice(0, 3);
  return `<tr class="court-row"><th scope="row" class="court-label" title="${escapeHtml(`${row.court.name} · ${row.court.surface}`)}">
    <span class="court-short">${escapeHtml(shortName)}<small>${escapeHtml(row.court.surface[0].toUpperCase())}</small></span>
  </th>${cells}</tr>`;
}

function loadingRows(columns) {
  return `<tr class="court-row skeleton"><th scope="row" class="court-label"><span class="shimmer"></span></th>${
    columns.map(() => '<td class="slot-cell"><span class="shimmer"></span></td>').join("")}</tr>`;
}

export function renderGrid(container, model, { date, hours, collapsed, allCollapsed, pastBefore, surface }) {
  cellInfo = new Map();
  const { columns, sections, nothingMatches } = model;
  const columnTotals = new Map(columns.map((hour) => [hour, 0]));
  for (const section of sections) {
    for (const row of section.courts) {
      for (const hour of row.slots.keys()) columnTotals.set(hour, (columnTotals.get(hour) || 0) + 1);
    }
  }
  const context = { columnCount: columns.length, date, hours, pastBefore, columnTotals };
  const filterText = hours.size ? "at the chosen hours" : "on this day";

  if (!sections.length) {
    container.innerHTML = nothingMatches.length
      ? `<div class="empty-state"><strong>Nothing matches.</strong>
          <p>No courts are free ${escapeHtml(filterText)}. Try other hours, another surface, or more venues.</p></div>`
      : `<div class="empty-state"><strong>Pick the venues you play at.</strong>
          <p>Court Radar remembers them for next time.</p>
          <button class="choose-venues" type="button" data-action="choose-venues">Choose venues</button></div>`;
    return;
  }

  const header = columns.map((hour) => {
    const classes = ["time-label"];
    if (hours.has(hour)) classes.push("is-selected-time");
    if (hour < pastBefore) classes.push("past");
    return `<th scope="col" class="${classes.join(" ")}" data-hour="${hour}" data-column-total="${columnTotals.get(hour)}">
      <button type="button" data-action="toggle-hour" data-hour="${hour}" aria-pressed="${hours.has(hour)}"
        aria-label="${hours.has(hour) ? "Stop filtering by" : "Only show courts free at"} ${hourLabel(hour)}">${String(hour).padStart(2, "0")}</button>
    </th>`;
  }).join("");

  const bodies = sections.map((section) => {
    const isCollapsed = collapsed.has(section.venue.code);
    let rows = venueHead(section, { ...context, collapsed: isCollapsed });
    if (section.status === "loading") rows += loadingRows(columns);
    if (section.status === "live" && !isCollapsed) {
      rows += section.courts.map((row) => courtRow(section, row, columns, context)).join("");
    }
    return `<tbody class="venue" data-venue="${section.venue.code}" data-status="${section.status}"
      ${isCollapsed ? "data-collapsed" : ""}>${rows}</tbody>`;
  }).join("");

  const footer = nothingMatches.length
    ? `<p class="grid-footnote">Nothing free ${escapeHtml(filterText)} at ${escapeHtml(nothingMatches.map((venue) => venue.name).join(", "))}.</p>`
    : "";

  container.innerHTML = `<table class="grid" style="--columns: ${columns.length}">
    <thead><tr><th scope="col" class="corner"><span class="sr-only">Court</span>
      <button class="collapse-all${allCollapsed ? " is-collapsed" : ""}" type="button" data-action="collapse-all"
        title="${allCollapsed ? "Expand" : "Collapse"} all venues" aria-label="${allCollapsed ? "Expand" : "Collapse"} all venues">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 20 5-5 5 5M7 4l5 5 5-5"/></svg>
      </button></th>${header}</tr></thead>
    ${bodies}
  </table>${footer}`;
}

export function scrollToHour(container, hour) {
  const cell = container.querySelector(`th.time-label[data-hour="${hour}"]`);
  const corner = container.querySelector("th.corner");
  if (!cell || !corner) return;
  container.scrollLeft = Math.max(0, cell.offsetLeft - corner.offsetWidth - 6);
}

export function revealVenue(container, code) {
  const body = container.querySelector(`tbody[data-venue="${CSS.escape(code)}"]`);
  const head = container.querySelector("thead");
  if (!body) return;
  container.scrollTo({ top: Math.max(0, body.offsetTop - (head?.offsetHeight || 0)), behavior: "smooth" });
  body.classList.remove("flash");
  requestAnimationFrame(() => body.classList.add("flash"));
}

function tooltipContent(cell) {
  const hour = Number(cell.dataset.hour);
  if (cell.tagName === "TH") {
    const count = Number(cell.dataset.columnTotal || 0);
    return [
      ["strong", `${hourLabel(hour)} across all courts`],
      ["span", `${count} open ${count === 1 ? "court" : "courts"}`, "hover-totals"]
    ];
  }
  const info = cellInfo.get(slotKey(cell.dataset.venue, cell.dataset.court, hour));
  if (!info) return null;
  const { venue, court, slot, rowTotal, columnTotal } = info;
  const lines = [
    ["strong", `${court.name} · ${hourLabel(hour)}${slot?.endTime ? `–${slot.endTime}` : ""}`],
    ["span", `${venue.name} · ${capitalise(court.surface)} · ${SOURCES[venue.source].label}`]
  ];
  if (cell.classList.contains("past")) {
    lines.push(["span", "Already started", "unavailable"]);
  } else if (slot) {
    lines.push(["span", slot.memberOnly ? "Available to Member Plus" : "Available", "available"]);
    if (priceText(slot)) lines.push(["span", priceText(slot)]);
    if (slot.note) lines.push(["span", slot.note]);
  } else {
    lines.push(["span", "Not available", "unavailable"]);
  }
  lines.push(["span", `${court.name}: ${rowTotal} open ${rowTotal === 1 ? "hour" : "hours"} · ${hourLabel(hour)}: ${
    columnTotal} open ${columnTotal === 1 ? "court" : "courts"}`, "hover-totals"]);
  return lines;
}

// Event handling is attached once; the table inside is replaced on every render.
export function attachGridInteractions(container, tooltip, onAction) {
  let hovered = null;
  const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");

  const clearHighlight = () => {
    container.querySelectorAll(".is-row-highlighted, .is-column-highlighted, .is-hovered")
      .forEach((cell) => cell.classList.remove("is-row-highlighted", "is-column-highlighted", "is-hovered"));
    hovered = null;
  };
  const hideTooltip = () => {
    tooltip.hidden = true;
  };

  container.addEventListener("click", (event) => {
    const target = event.target.closest("[data-action]");
    if (target && container.contains(target)) onAction(target.dataset.action, target.dataset);
  });

  container.addEventListener("pointerover", (event) => {
    const cell = event.target.closest("td[data-hour], th.time-label, th.court-label");
    if (!cell) {
      clearHighlight();
      hideTooltip();
      return;
    }
    if (cell === hovered) return;
    clearHighlight();
    hovered = cell;
    cell.classList.add("is-hovered");
    if (cell.parentElement.classList.contains("court-row")) {
      [...cell.parentElement.children].forEach((item) => item.classList.add("is-row-highlighted"));
    }
    if (cell.dataset.hour) {
      container.querySelectorAll(`:is(td, th)[data-hour="${cell.dataset.hour}"]`)
        .forEach((item) => item.classList.add("is-column-highlighted"));
    }

    if (!canHover.matches || !cell.dataset.hour) return hideTooltip();
    const lines = tooltipContent(cell);
    if (!lines) return hideTooltip();
    tooltip.replaceChildren(...lines.map(([tag, text, tone]) => {
      const element = document.createElement(tag);
      element.textContent = text;
      if (tone) element.className = tone;
      return element;
    }));
    tooltip.hidden = false;
  });

  container.addEventListener("pointermove", (event) => {
    if (tooltip.hidden) return;
    const gap = 14;
    const { width, height } = tooltip.getBoundingClientRect();
    const left = Math.min(event.clientX + gap, window.innerWidth - width - 10);
    const top = event.clientY + gap + height > window.innerHeight
      ? event.clientY - height - gap
      : event.clientY + gap;
    tooltip.style.transform = `translate(${Math.max(10, left)}px, ${Math.max(10, top)}px)`;
  });

  container.addEventListener("pointerleave", () => {
    clearHighlight();
    hideTooltip();
  });
  container.addEventListener("scroll", hideTooltip, { passive: true });
}
