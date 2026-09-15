import { NO_EXPENSES } from "../../../../lib/messages.js";
import type {
  CategoryBucket,
  ExpenseListItem,
  TotalBucket,
} from "./queries.js";

export const EXPENSE_LIST_LIMIT = 50;

function formatAmount(amountCents: number, currency: string): string {
  return `${(amountCents / 100).toFixed(2)} ${currency}`;
}

function wrapReport(title: string, bodyLines: string[]): string {
  if (bodyLines.length === 0) {
    return `📊 Report: ${title}\n\n${NO_EXPENSES}`;
  }

  return `📊 Report: ${title}\n\n${bodyLines.join("\n")}`;
}

function expenseCountLabel(count: number): string {
  return count === 1 ? "1 expense" : `${count} expenses`;
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

export function formatExpenseList(
  title: string,
  rows: ExpenseListItem[],
  totalCount: number,
): string {
  if (totalCount === 0) {
    return `📋 Expenses: ${title}\n\n${NO_EXPENSES}`;
  }

  const lines = rows.map(
    (row) =>
      `- #${row.id} ${formatAmount(row.amountCents, row.currency)} ${row.category} — ${row.note} (${row.occurredOn})`,
  );

  const footer =
    totalCount > rows.length
      ? `Showing ${rows.length} of ${totalCount} expenses. Narrow the date range for the rest.`
      : expenseCountLabel(totalCount);

  return `📋 Expenses: ${title}\n\n${lines.join("\n")}\n\n${footer}`;
}
