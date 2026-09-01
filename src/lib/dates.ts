import { TIME_ZONE } from "../constants.js";

export function getReferenceDate(
  timeZone = TIME_ZONE,
  now = new Date(),
): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
}
