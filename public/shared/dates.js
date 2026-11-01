// Dates travel as plain "YYYY-MM-DD" strings in London time. Arithmetic is done
// at UTC noon so daylight-saving changes never shift a day.

const LONDON = "Europe/London";

export function isValidDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().startsWith(value);
}

export function londonToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: LONDON,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function londonHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: LONDON,
    hour: "2-digit",
    hourCycle: "h23"
  }).format(now));
}

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function daysBetween(from, to) {
  return Math.round((new Date(`${to}T12:00:00Z`) - new Date(`${from}T12:00:00Z`)) / 86_400_000);
}

export function dayOfWeek(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

export function formatDay(date, options = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { ...options, timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`));
}

export function toTime(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function hourOf(time) {
  return Number(time.slice(0, 2));
}

export function hourLabel(hour) {
  return `${String(hour).padStart(2, "0")}:00`;
}
