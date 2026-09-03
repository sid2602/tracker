import { NO_EXPENSES, reportTitle } from "../../lib/messages.js";
import type { ReportPeriod } from "../../lib/periods.js";
import type { CategoryBucket, TotalBucket } from "./queries.js";

function formatAmount(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

function wrapReport(period: ReportPeriod, bodyLines: string[]): string {
  if (bodyLines.length === 0) {
    return `${reportTitle(period)}\n\n${NO_EXPENSES}`;
  }

  return `${reportTitle(period)}\n\n${bodyLines.join("\n")}`;
}

export function formatTotalReport(
  period: ReportPeriod,
  rows: TotalBucket[],
): string {
  return wrapReport(
    period,
    rows.map((row) => formatAmount(row.amountCents, row.currency)),
  );
}

export function formatCategoryReport(
  period: ReportPeriod,
  rows: CategoryBucket[],
): string {
  return wrapReport(
    period,
    rows.map(
      (row) => `${row.category}: ${formatAmount(row.amountCents, row.currency)}`,
    ),
  );
}
