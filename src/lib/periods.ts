import { TIME_ZONE } from "../constants.js";

export type ReportPeriod = "this_month" | "last_month";

export type DateRange = {
  start: string;
  end: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIsoDate(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function getZonedYearMonth(
  now: Date,
  timeZone: string,
): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const yearPart = parts.find((part) => part.type === "year");
  const monthPart = parts.find((part) => part.type === "month");

  if (!yearPart || !monthPart) {
    throw new Error("Failed to resolve zoned date");
  }

  return {
    year: Number(yearPart.value),
    month: Number(monthPart.value),
  };
}

function previousMonth(
  year: number,
  month: number,
): { year: number; month: number } {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }

  return { year, month: month - 1 };
}

export function getPeriodRange(
  period: ReportPeriod,
  now = new Date(),
  timeZone = TIME_ZONE,
): DateRange {
  const current = getZonedYearMonth(now, timeZone);
  const { year, month } =
    period === "this_month"
      ? current
      : previousMonth(current.year, current.month);

  return {
    start: formatIsoDate(year, month, 1),
    end: formatIsoDate(year, month, lastDayOfMonth(year, month)),
  };
}
