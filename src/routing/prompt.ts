export const getRouterPrompt = (text: string) => `Classify a Signal note.
The user message may be in any language.

Return intent:
- expense: logging a purchase or bill
- report: asking for an expense report
- ignore: anything else, including bot replies such as confirmations and reports
  (for example messages containing "Saved", "Report", "✅", or "📊")

Always return period and group_by:
- for report: period is this_month or last_month, group_by is total or category
- for expense or ignore: set period and group_by to null

Message: ${text}`;
