// LTA's court-booking API fronts ClubSpark, so it also covers ClubSpark venues
// such as Battersea Park. It answers per venue and per date.

import { addDays, daysBetween, londonToday } from "./dates.js";
import { bookingUrlForDate } from "./venues.js";

export const LTA_AVAILABILITY_URL = "https://www.lta.org.uk/api/courtdetail/availability";

export function ltaEndpoint(venue, date) {
  const url = new URL(LTA_AVAILABILITY_URL);
  url.searchParams.set("venueid", venue.lta.id);
  url.searchParams.set("date", date);
  return url.toString();
}

export function surfaceName(surface) {
  const name = String(surface || "hard").toLowerCase();
  return name === "tarmac" ? "hard" : name;
}

export function normalizeLta(payload, venue, date, today = londonToday()) {
  if (payload?.error?.hasError) {
    throw new Error(payload.error.errorMessage || "LTA has no public availability for this venue");
  }

  const rules = payload.rules || {};
  const bookable = Array.isArray(rules.availableDates) ? [...rules.availableDates].sort() : [];
  const lastBookable = bookable.at(-1);
  if (rules.outsideBookingWindow || (lastBookable && date > lastBookable)) {
    // availableDates lists every date open for booking now, so the latest one
    // tells us how many days ahead this venue takes bookings.
    const windowDays = lastBookable ? Math.max(0, daysBetween(today, lastBookable)) : 0;
    return {
      venue: venue.code,
      date,
      status: "outside-window",
      bookableFrom: addDays(date, -windowDays),
      courts: [],
      slots: []
    };
  }
  if (bookable.length && !bookable.includes(date)) {
    return {
      venue: venue.code,
      date,
      status: "closed",
      note: "Not bookable online for this date",
      courts: [],
      slots: []
    };
  }

  const details = [...(payload.venueDetails || [])]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const bookingUrl = bookingUrlForDate(venue, date);

  return {
    venue: venue.code,
    date,
    status: "live",
    courts: details.map((court) => ({
      id: court.id,
      name: court.name,
      surface: surfaceName(court.surface)
    })),
    slots: details.flatMap((court) =>
      (court.availableSlots || []).map((slot) => ({
        courtId: court.id,
        time: slot.startTime.slice(11, 16),
        endTime: slot.endTime.slice(11, 16),
        price: slot.price,
        bookingUrl
      }))
    )
  };
}
