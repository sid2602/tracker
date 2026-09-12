import { TIME_ZONE } from "../constants.js";

export function getReferenceDate(
  timeZone = TIME_ZONE,
  now = new Date(),
): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}

export function isValidCalendarDate(value: string): boolean {
  const [yearPart, monthPart, dayPart] = value.split("-");
  const year = Number(yearPart);
  const month = Number(monthPart);
  const day = Number(dayPart);
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(year, month - 1, day);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
