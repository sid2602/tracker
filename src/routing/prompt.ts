export const getRouterPrompt = (text: string) => `Classify a Signal note.
The user message may be in any language.

Return intent:
- expense: logging a purchase or bill
- report: asking for an expense report or summary of spent money, including reports broken down by category or filtered by category.
- category: ONLY managing the list of available categories (adding new categories, removing them, or listing allowed category names). NOT for expense reports.
- ignore: anything else, including bot replies such as confirmations and reports
  (for example messages containing "Saved", "Report", "✅", or "📊")

Message: ${text}`;
