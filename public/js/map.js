// The map view, drawn with MapLibre GL on OpenFreeMap's free vector tiles, so
// it needs no account or API key. The library loads the first time someone
// opens the map.

import { VENUES, googleMapsUrl } from "../shared/venues.js";
import { escapeHtml, plural } from "./html.js";
import { bookingOpensText } from "./grid.js";

const MAPLIBRE = "https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl";
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
let ready = null;
let map = null;
let loaded = null;
let fitted = false;

function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  ready ??= new Promise((resolve, reject) => {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = `${MAPLIBRE}.css`;
    document.head.append(style);
    const script = document.createElement("script");
    script.src = `${MAPLIBRE}.js`;
    script.onload = () => resolve(window.maplibregl);
    script.onerror = () => {
      ready = null;
      reject(new Error("The map library could not load"));
    };
    document.head.append(script);
  });
  return ready;
}

function message(element, title, detail) {
  element.innerHTML = `<div class="map-message"><strong>${title}</strong><span>${detail}</span></div>`;
}

function summaryFor(section, isSelected) {
  if (!isSelected) return "Not in your venues";
  if (section?.status === "live") return `${plural(section.freeCourts || 0, "court")} free · ${plural(section.free, "open hour")}`;
  if (section?.status === "outside-window") return bookingOpensText(section.venue, section.result);
  if (section?.status === "closed") return "Not bookable online for this date";
  if (section?.status === "error") return "Didn’t answer";
  return "Checking…";
}

const ICONS = {
  grid: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
  pin: '<path d="M20 10c0 5-8 12-8 12s-8-7-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  remove: '<path d="M5 12h14"/>'
};

function iconControl(tag, icon, label) {
  const element = document.createElement(tag);
  element.className = "popup-icon";
  element.title = label;
  element.setAttribute("aria-label", label);
  element.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  if (tag === "button") element.type = "button";
  return element;
}

function popupContent(venue, section, isSelected, handlers) {
  const popup = document.createElement("div");
  popup.className = "venue-popup";
  popup.innerHTML = `<strong>${escapeHtml(venue.name)}</strong>
    <span>${escapeHtml(summaryFor(section, isSelected))}</span>
    <span class="muted">${escapeHtml(venue.rules)}</span>`;
  const actions = document.createElement("div");
  actions.className = "popup-actions";
  if (isSelected) {
    const show = iconControl("button", "grid", "Show in grid");
    show.addEventListener("click", () => handlers.onShowVenue(venue.code));
    actions.append(show);
  }
  const maps = iconControl("a", "pin", "Open in Google Maps");
  maps.href = googleMapsUrl(venue);
  maps.target = "_blank";
  maps.rel = "noreferrer";
  actions.append(maps);
  const toggle = iconControl("button", isSelected ? "remove" : "add", isSelected ? "Remove from my venues" : "Add to my venues");
  toggle.addEventListener("click", () => {
    popup.closest(".maplibregl-popup")?.remove();
    handlers.onToggleVenue(venue.code, !isSelected);
  });
  actions.append(toggle);
  popup.append(actions);
  return popup;
}

function venueFeatures(model, selected) {
  const sections = new Map(model.sections.map((section) => [section.venue.code, section]));
  return {
    type: "FeatureCollection",
    features: VENUES.map((venue) => {
      const section = sections.get(venue.code);
      const isSelected = selected.has(venue.code);
      const live = section?.status === "live";
      const tone = !isSelected ? "off" : !section || section.status === "loading" ? "loading" : live && section.free ? "open" : "full";
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: [venue.lng, venue.lat] },
        properties: { code: venue.code, tone, label: isSelected && live ? String(section.free) : "" }
      };
    })
  };
}

// Venues are drawn as map layers rather than DOM markers, so popups always
// sit above them. The latest model is kept here for the click handler.
let latest = null;

function addVenueLayers(maplibregl) {
  map.addSource("venues", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  // A halo under the venue currently hovered here or in the grid.
  map.addLayer({
    id: "venue-highlight",
    type: "circle",
    source: "venues",
    filter: ["==", ["get", "code"], ""],
    paint: {
      "circle-radius": 22,
      "circle-color": "#ff7448",
      "circle-opacity": 0.35,
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "#15372c"
    }
  });
  map.addLayer({
    id: "venues",
    type: "circle",
    source: "venues",
    paint: {
      "circle-radius": ["match", ["get", "tone"], "off", 7, 14],
      "circle-color": ["match", ["get", "tone"], "open", "#d9ff5f", "full", "#c7ccc4", "off", "#1f5a43", "#fffdf7"],
      "circle-opacity": ["match", ["get", "tone"], "off", 0.75, 1],
      "circle-stroke-width": ["match", ["get", "tone"], "off", 1.5, 2],
      "circle-stroke-color": ["match", ["get", "tone"], "off", "#ffffff", "#15372c"]
    }
  });
  map.addLayer({
    id: "venue-counts",
    type: "symbol",
    source: "venues",
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Noto Sans Bold"],
      "text-size": 11,
      "text-allow-overlap": true
    },
    paint: { "text-color": "#15372c" }
  });

  // An invisible, finger-sized circle under each venue makes small dots easy
  // to tap. Where tap areas overlap, the venue nearest the tap wins.
  map.addLayer({
    id: "venue-hits",
    type: "circle",
    source: "venues",
    paint: { "circle-radius": 22, "circle-opacity": 0 }
  });

  const nearestCode = (event) => {
    const distance = (feature) => {
      const point = map.project(feature.geometry.coordinates);
      return Math.hypot(point.x - event.point.x, point.y - event.point.y);
    };
    return event.features.reduce((best, feature) => (distance(feature) < distance(best) ? feature : best))
      .properties.code;
  };

  map.on("click", "venue-hits", (event) => {
    const code = nearestCode(event);
    latest.onPickVenue?.(code);
    const venue = VENUES.find((item) => item.code === code);
    const section = latest.model.sections.find((item) => item.venue.code === code);
    new maplibregl.Popup({ offset: 14, maxWidth: "280px" })
      .setLngLat([venue.lng, venue.lat])
      .setDOMContent(popupContent(venue, section, latest.selected.has(code), latest))
      .addTo(map);
  });
  let hovered = null;
  map.on("mousemove", "venue-hits", (event) => {
    map.getCanvas().style.cursor = "pointer";
    const code = nearestCode(event);
    if (code === hovered) return;
    hovered = code;
    highlightMapVenue(code);
    latest.onHoverVenue?.(code);
  });
  map.on("mouseleave", "venue-hits", () => {
    map.getCanvas().style.cursor = "";
    hovered = null;
    highlightMapVenue(null);
    latest.onHoverVenue?.(null);
  });
}

// Rings a venue on the map, or clears the ring when `code` is null.
export function highlightMapVenue(code) {
  if (map?.getLayer("venue-highlight")) {
    map.setFilter("venue-highlight", ["==", ["get", "code"], code || ""]);
  }
}

export async function renderMap(element, model, handlers) {
  const { selected } = handlers;
  let maplibregl;
  try {
    maplibregl = await loadMapLibre();
  } catch {
    message(element, "The map couldn’t load", "Check your connection and try again.");
    return;
  }

  latest = { model, ...handlers };
  if (!map) {
    element.replaceChildren();
    map = new maplibregl.Map({ container: element, style: STYLE, center: [-0.151, 51.449], zoom: 11.5 });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    loaded = new Promise((resolve) => map.on("load", resolve)).then(() => addVenueLayers(maplibregl));
  }
  await loaded;
  map.getSource("venues").setData(venueFeatures(model, selected));

  if (!fitted) {
    const points = VENUES.filter((venue) => selected.has(venue.code));
    if (points.length) {
      const bounds = new maplibregl.LngLatBounds();
      points.forEach((venue) => bounds.extend([venue.lng, venue.lat]));
      map.fitBounds(bounds, { padding: 60, maxZoom: 14, duration: 0 });
      fitted = true;
    }
  }
  requestAnimationFrame(() => map.resize());
}
