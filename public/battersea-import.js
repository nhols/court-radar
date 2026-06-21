(function attachBatterseaImport(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.BatterseaImport = api;
})(typeof globalThis === "object" ? globalThis : this, function createBatterseaImport() {
  const BATTERSEA_BASE = "https://clubspark.lta.org.uk";
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

  function toTime(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  }

  function endpointForDate(date) {
    const url = new URL(
      `${BATTERSEA_BASE}/v0/VenueBooking/BatterseaParkTennisCourts/GetVenueSessions`
    );
    url.searchParams.set("resourceID", "");
    url.searchParams.set("startDate", date);
    url.searchParams.set("endDate", date);
    url.searchParams.set("roleId", "");
    return url.toString();
  }

  function parseJson(text) {
    let payload;
    try {
      payload = JSON.parse(String(text).trim().replace(/^\uFEFF/, ""));
    } catch {
      throw new Error("That is not valid JSON. Copy the complete ClubSpark response and try again.");
    }

    if (
      !payload ||
      !Array.isArray(payload.Resources) ||
      !Number.isFinite(payload.MinimumInterval) ||
      payload.MinimumInterval <= 0
    ) {
      throw new Error("This does not look like a ClubSpark venue-sessions response.");
    }
    return payload;
  }

  function parseAvailability(payload, date) {
    const bookingUrl = `${BATTERSEA.bookingUrl}#?date=${date}&role=guest`;
    const courts = payload.Resources.map((court) => ({
      id: court.ID,
      name: court.Name,
      location: BATTERSEA.code,
      surface: court.Surface === 3 ? "carpet" : court.Surface === 7 ? "hard" : "other"
    }));
    const slots = [];
    let matchingDateFound = false;

    for (const court of payload.Resources) {
      const day = court.Days?.find((item) => item.Date?.startsWith(date));
      if (day) matchingDateFound = true;
      const availableSessions = (day?.Sessions || []).filter((session) => session.Capacity > 0);

      for (const session of availableSessions) {
        for (
          let start = session.StartTime;
          start + payload.MinimumInterval <= session.EndTime;
          start += payload.MinimumInterval
        ) {
          const end = start + payload.MinimumInterval;
          slots.push({
            courtId: court.ID,
            court: court.Name,
            location: BATTERSEA.code,
            time: toTime(start),
            endTime: toTime(end),
            price: session.GuestPrice || session.CourtCost || session.Cost || undefined,
            bookingUrl
          });
        }
      }
    }

    if (payload.Resources.length && !matchingDateFound) {
      throw new Error(`The pasted response does not contain availability for ${date}.`);
    }

    return {
      location: { ...BATTERSEA, availabilityStatus: "imported" },
      courts,
      slots
    };
  }

  function importText(text, date) {
    return parseAvailability(parseJson(text), date);
  }

  function mergeIntoAvailability(data, battersea) {
    return {
      ...data,
      locations: [
        ...data.locations.filter((location) => location.code !== BATTERSEA.code),
        battersea.location
      ],
      courts: [
        ...data.courts.filter((court) => court.location !== BATTERSEA.code),
        ...battersea.courts
      ],
      slots: [
        ...data.slots.filter((slot) => slot.location !== BATTERSEA.code),
        ...battersea.slots
      ],
      errors: (data.errors || []).filter((error) => error.location !== BATTERSEA.code)
    };
  }

  return {
    endpointForDate,
    importText,
    mergeIntoAvailability,
    parseAvailability,
    parseJson,
    toTime
  };
});
