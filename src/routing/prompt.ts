export const getRouterPrompt = (text: string) => `Classify a Signal note.
The user message may be in any language.

Return intent:
- expense: logging a purchase or bill
- report: asking for an expense report or summary of spent money, including reports broken down by category or filtered by category.
- category: ONLY when the user EXPLICITLY uses the word "category" (or its translations, grammatical variations, and typos like "kategoria", "kategorii", "kategoriee") to manage their list of custom categories (e.g. "add category Food", "delete category Entertainment"). If the core word "category" (in any language or form) is missing, DO NOT choose this intent.
- modification: modifying, undoing, or deleting a specific past expense/purchase (e.g., "undo", "delete the last expense", "delete vegetables for 20 PLN", "change the category of coffee to food").
- ignore: anything else, including bot replies such as confirmations and reports
  (for example messages containing "Saved", "Report", "✅", or "📊")

Message: ${text}`;
