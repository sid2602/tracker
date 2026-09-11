export const getReportPrompt = (text: string, currentDateStr: string) => `Extract reporting parameters from a Signal note.
The user message may be in any language.

Determine the start_date, end_date, categories, title, and group_by parameters requested by the user.

Use the provided current date as a reference to determine exact dates for relative expressions (e.g. "yesterday", "this week", "last month").
Current date: ${currentDateStr}

Rules for date resolution:
- If the user asks for "today" (dzisiaj, etc.), or makes typos like "dzidiaj", use the exact current date.
- If the user asks for "month" (miesiąc, mieziac) without specifying which one, default to the CURRENT month (from the 1st to the last day of the current month).
- If the user asks for a report/summary/spending total without any date, default to the FULL CURRENT month (1st through last day), not only up to today.

group_by (pick exactly one):
- total: sum only. Use for "how much", "ile wydałem", "podsumowanie", "what did I spend on X" when they want a total amount. This is the DEFAULT.
- category: sums grouped by category. Use for "by category", "breakdown", "na kategorie", "według kategorii".
- list: itemized individual expenses (each purchase as a line). Use ONLY when they clearly ask to list/show items: "list expenses", "lista wydatków", "show my expenses", "pokaż wydatki", "na co wydałem", "what did I buy", "itemize", "szczegóły".
  Do NOT use list for plain "how much" / "what did I spend on food" total questions.

Message: ${text}`;

