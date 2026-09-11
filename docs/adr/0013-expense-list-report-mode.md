# 13. Expense List Report Mode

Date: 2026-09-11

## Status

Accepted

## Context

The `report` intent only returns aggregated totals (`group_by: "total"`) or sums grouped by category (`group_by: "category"`). Users also ask for a concrete list of what they spent money on for a day or period (e.g. "lista wydatków wczoraj", "show what I spent this week"). Those requests currently still produce an aggregate report instead of line items.

Date-range parsing and category filters already live in the reports domain. A separate router intent would duplicate that flow.

## Decision

1. Extend `reportGroupBySchema` with a third value: `"list"`.
2. Keep routing under the existing `report` intent; clarify in the router prompt that listing past expenses by period is still `report`.
3. Add `queryExpenseList` to fetch individual expense rows (`id`, amount, currency, category, `occurred_on`, `note`) for the parsed date range.
4. Format a line-item reply including the original `note` (no translation), with a hard cap of **50** rows. If more exist, show the first 50 and ask the user to narrow the date range.
5. Default `group_by` remains `"total"` for sum-style questions ("ile wydałem"); `"list"` only when the user asks to list or itemize expenses.

## Consequences

- Signal replies can be longer (up to ~50 lines) but stay bounded.
- The report parser prompt must distinguish sum/breakdown vs list phrasing in English and Polish.
- No new domain, intent, or database schema changes.
