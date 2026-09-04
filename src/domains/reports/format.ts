import { NO_EXPENSES } from "../../lib/messages.js";
import type { CategoryBucket, TotalBucket } from "./queries.js";

function formatAmount(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

function wrapReport(title: string, bodyLines: string[]): string {
  if (bodyLines.length === 0) {
    return `📊 Report: ${title}\n\n${NO_EXPENSES}`;
  }

  return `📊 Report: ${title}\n\n${bodyLines.join("\n")}`;
}

export function formatTotalReport(
  title: string,
  rows: TotalBucket[],
): string {
  return wrapReport(
    title,
    rows.map((row) => formatAmount(row.amountCents, row.currency)),
  );
}

export function formatCategoryReport(
  title: string,
  rows: CategoryBucket[],
): string {
  return wrapReport(
    title,
    rows.map(
      (row) => `${row.category}: ${formatAmount(row.amountCents, row.currency)}`,
    ),
  );
}
