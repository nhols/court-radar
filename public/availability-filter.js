(function exposeAvailabilityFilter(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.CourtFilters = api;
}(typeof globalThis === "object" ? globalThis : this, function createAvailabilityFilter() {
  function courtsAvailableAtAllTimes(courts, slots, selectedTimes) {
    const requiredTimes = new Set(selectedTimes);
    if (!requiredTimes.size) return courts;

    const timesByCourt = new Map();
    for (const slot of slots) {
      if (!timesByCourt.has(slot.courtId)) timesByCourt.set(slot.courtId, new Set());
      timesByCourt.get(slot.courtId).add(slot.time);
    }

    return courts.filter((court) => {
      const availableTimes = timesByCourt.get(court.id);
      return availableTimes && [...requiredTimes].every((time) => availableTimes.has(time));
    });
  }

  return { courtsAvailableAtAllTimes };
}));
