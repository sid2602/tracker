export const getReportPrompt = (text: string) => `Extract reporting parameters from a Signal note.
The user message may be in any language.

Determine the period and group_by parameters requested by the user.

period:
- this_month: "this month", "current month", default if not specified
- last_month: "last month", "previous month"

group_by:
- total: just the total sum, default if not specified
- category: grouped by category (e.g. "by category", "categories", "breakdown")

Message: ${text}`;
