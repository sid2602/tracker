import type { ReportPeriod } from "./periods.js";

export const UNRECOGNIZED_MESSAGE = "Could not recognize that message.";
export const MESSAGE_ALREADY_SAVED = "Message already saved";
export const NO_EXPENSES = "no expenses";

export function savedItemsMessage(count: number): string {
  return count === 1 ? "Saved 1 item" : `Saved ${count} items`;
}

export function reportTitle(period: ReportPeriod): string {
  const label = period === "this_month" ? "this month" : "last month";
  return `📊 Report: ${label}`;
}
