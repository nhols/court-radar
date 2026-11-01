// The date strip, filter pills and their popovers. Controls never change
// state themselves; they report what the viewer asked for through `actions`.

import { VENUES } from "../shared/venues.js";
import { addDays, formatDay } from "../shared/dates.js";
import { DATE_RANGE_DAYS, FIRST_HOUR, LAST_HOUR } from "./prefs.js";
import { hoursLabel } from "./model.js";
import { capitalise, escapeHtml } from "./html.js";

export const HOUR_PRESETS = {
  any: [],
  morning: [7, 8, 9, 10, 11],
  afternoon: [12, 13, 14, 15, 16],
  evening: [17, 18, 19, 20, 21]
};

const $ = (selector) => document.querySelector(selector);

// A select is as wide as its longest option; this sizes it to the chosen one.
function fitSelect(select) {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${getComputedStyle(select).font}`;
  probe.textContent = select.selectedOptions[0]?.text || "";
  document.body.append(probe);
  select.style.width = `${probe.offsetWidth + 24}px`;
  probe.remove();
}

export function createControls(actions) {
  const elements = {
    dayStrip: $("#day-strip"),
    venuesButton: $("#venues-button"),
    venuesLabel: $("#venues-label"),
    venueSearch: $("#venue-search"),
    venueOptions: $("#venue-options"),
    hoursButton: $("#hours-button"),
    hoursLabel: $("#hours-label"),
    hourOptions: $("#hour-options"),
    surface: $("#surface-control"),
    sort: $("#sort"),
    hideFull: $("#hide-full"),
    filtersToggle: $("#filters-toggle"),
    filters: $("#filters"),
    viewButtons: [...document.querySelectorAll("[data-view]")],
    backdrop: $("#sheet-backdrop")
  };
  const popovers = [
    { button: elements.venuesButton, panel: $("#venues-panel") },
    { button: elements.hoursButton, panel: $("#hours-panel") }
  ];
  let open = null;
  let settleTimer = null;
  let renderedStripFor = null;

  function closePopover() {
    if (!open) return;
    open.panel.hidden = true;
    open.button.setAttribute("aria-expanded", "false");
    elements.backdrop.hidden = true;
    open = null;
  }

  function openPopover(popover) {
    closePopover();
    open = popover;
    popover.panel.hidden = false;
    popover.button.setAttribute("aria-expanded", "true");
    elements.backdrop.hidden = false;
    if (popover.panel.id === "venues-panel" && window.matchMedia("(hover: hover)").matches) {
      elements.venueSearch.focus();
    }
  }

  for (const popover of popovers) {
    popover.button.addEventListener("click", () => (open === popover ? closePopover() : openPopover(popover)));
    popover.panel.addEventListener("click", (event) => {
      if (event.target.closest("[data-close]")) closePopover();
    });
  }
  elements.backdrop.addEventListener("click", closePopover);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && open) {
      const { button } = open;
      closePopover();
      button.focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (open && !open.panel.contains(event.target) && !open.button.contains(event.target)) closePopover();
  });

  elements.dayStrip.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (button) actions.setDate(button.dataset.date);
  });

  elements.venueSearch.addEventListener("input", () => filterVenueOptions());
  elements.venueOptions.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-code]");
    if (input) actions.toggleVenue(input.dataset.code, input.checked);
  });
  $("#venues-panel").addEventListener("click", (event) => {
    if (event.target.closest("[data-clear-venues]")) actions.clearVenues();
  });

  $("#hours-panel").addEventListener("click", (event) => {
    const preset = event.target.closest("[data-preset]");
    if (preset) actions.setHours(HOUR_PRESETS[preset.dataset.preset]);
    const hour = event.target.closest("[data-hour]");
    if (hour) actions.toggleHour(Number(hour.dataset.hour));
  });
  $("#hours-panel").addEventListener("change", (event) => {
    if (event.target.name === "match") actions.setMatch(event.target.value);
  });

  elements.surface.addEventListener("click", (event) => {
    const button = event.target.closest("[data-surface]");
    if (button) actions.setSurface(button.dataset.surface);
  });
  elements.filtersToggle.addEventListener("click", () => actions.toggleFilters());
  elements.filters.addEventListener("transitionend", (event) => {
    if (event.target === elements.filters && event.propertyName === "max-height") {
      elements.filters.classList.toggle("settled", elements.filters.classList.contains("open"));
    }
  });
  elements.hideFull.addEventListener("change", () => actions.toggleHideFull());
  elements.sort.addEventListener("change", () => actions.setSort(elements.sort.value));
  elements.viewButtons.forEach((button) =>
    button.addEventListener("click", () => actions.setView(button.dataset.view)));

  elements.hourOptions.innerHTML = Array.from({ length: LAST_HOUR - FIRST_HOUR + 1 }, (_, index) => {
    const hour = FIRST_HOUR + index;
    return `<button type="button" data-hour="${hour}" aria-pressed="false">${String(hour).padStart(2, "0")}</button>`;
  }).join("");

  function renderVenueOptions(state) {
    const groups = new Map();
    for (const venue of VENUES) {
      if (!groups.has(venue.group)) groups.set(venue.group, []);
      groups.get(venue.group).push(venue);
    }
    elements.venueOptions.innerHTML = [...groups].map(([group, venues]) => `
      <fieldset>
        <legend>${escapeHtml(group)}</legend>
        <p class="group-rules">${escapeHtml(venues[0].rules)}</p>
        ${venues.map((venue) => `
          <label class="venue-option" data-name="${escapeHtml(`${venue.name} ${venue.postcode || ""}`.toLowerCase())}">
            <input type="checkbox" data-code="${venue.code}" ${state.venues.has(venue.code) ? "checked" : ""}>
            <span>${escapeHtml(venue.name)}</span>
            ${venue.postcode ? `<small>${escapeHtml(venue.postcode)}</small>` : ""}
          </label>`).join("")}
      </fieldset>`).join("");
    filterVenueOptions();
  }

  function filterVenueOptions() {
    const query = elements.venueSearch.value.trim().toLowerCase();
    elements.venueOptions.querySelectorAll(".venue-option").forEach((option) => {
      option.hidden = Boolean(query) && !option.dataset.name.includes(query);
    });
    elements.venueOptions.querySelectorAll("fieldset").forEach((fieldset) => {
      fieldset.hidden = [...fieldset.querySelectorAll(".venue-option")].every((option) => option.hidden);
    });
  }

  function renderDayStrip(state, today) {
    const key = `${today}|${state.date}`;
    if (renderedStripFor === key) return;
    renderedStripFor = key;
    const days = Array.from({ length: DATE_RANGE_DAYS + 1 }, (_, index) => addDays(today, index));
    elements.dayStrip.innerHTML = days.map((date, index) => {
      const label = index === 0 ? "Today" : index === 1 ? "Tmrw" : formatDay(date, { weekday: "short" });
      const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
      return `<button type="button" class="day${weekend ? " weekend" : ""}" data-date="${date}"
        aria-pressed="${date === state.date}" aria-label="${escapeHtml(formatDay(date, { weekday: "long", day: "numeric", month: "long" }))}">
        <span class="day-name">${label}</span>
        <span class="day-number">${formatDay(date, { day: "numeric" })}</span>
      </button>`;
    }).join("");
    elements.dayStrip.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function update(state, { today, surfaces }) {
    renderDayStrip(state, today);

    const total = VENUES.length;
    elements.venuesLabel.textContent = state.venues.size === total
      ? "All venues"
      : `${state.venues.size} of ${total} venues`;
    if (!open || open.panel.id !== "venues-panel") renderVenueOptions(state);
    else elements.venueOptions.querySelectorAll("input[data-code]").forEach((input) => {
      input.checked = state.venues.has(input.dataset.code);
    });

    elements.hoursLabel.textContent = hoursLabel(state.hours);
    elements.hoursButton.classList.toggle("active", state.hours.size > 0);
    elements.hourOptions.querySelectorAll("[data-hour]").forEach((button) => {
      button.setAttribute("aria-pressed", String(state.hours.has(Number(button.dataset.hour))));
    });
    document.querySelectorAll('input[name="match"]').forEach((input) => {
      input.checked = input.value === state.match;
    });

    const options = ["any", ...new Set([...surfaces, ...(state.surface === "any" ? [] : [state.surface])])];
    elements.surface.innerHTML = options.map((surface) => `
      <button type="button" data-surface="${escapeHtml(surface)}" aria-pressed="${surface === state.surface}">
        ${surface === "any" ? "Any surface" : escapeHtml(capitalise(surface))}
      </button>`).join("");

    elements.sort.value = state.sort;
    fitSelect(elements.sort);
    elements.hideFull.checked = state.hideFull;
    if (elements.filters.classList.contains("open") !== state.filtersOpen) {
      closePopover();
      elements.filters.classList.remove("settled");
      elements.filters.classList.toggle("open", state.filtersOpen);
      // Backstop for when no transition runs (reduced motion, or roomy rows).
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => {
        elements.filters.classList.toggle("settled", elements.filters.classList.contains("open"));
      }, 350);
    }
    elements.filtersToggle.setAttribute("aria-expanded", String(state.filtersOpen));
    elements.filtersToggle.title = state.filtersOpen ? "Hide filters" : "Show filters";
    elements.filtersToggle.setAttribute("aria-label", elements.filtersToggle.title);
    elements.viewButtons.forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.view === state.view)));
  }

  return { update, closePopover, openVenues: () => openPopover(popovers[0]) };
}
