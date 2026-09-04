export const getReportPrompt = (text: string, currentDateStr: string) => `Extract reporting parameters from a Signal note.
The user message may be in any language.

Determine the start_date, end_date, categories, title, and group_by parameters requested by the user.

Use the provided current date as a reference to determine exact dates for relative expressions (e.g. "yesterday", "this week", "last month").
Current date: ${currentDateStr}

Rules for date resolution:
- If the user asks for "today" (dzisiaj, etc.), or makes typos like "dzidiaj", use the exact current date.
- If the user asks for "month" (miesiąc, mieziac) without specifying which one, default to the CURRENT month (from the 1st to the last day of the current month).
- If the user asks for "report" without any date, default to the CURRENT month.

group_by:
- total: just the total sum, default if not specified
- category: grouped by category (e.g. "by category", "categories", "breakdown", "na kategorie", "kategorie", "według kategorii", "ze względu na kategorie")

Message: ${text}`;
