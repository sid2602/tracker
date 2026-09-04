export const getRouterPrompt = (text: string) => `Classify a Signal note.
The user message may be in any language.

IMPORTANT RULES FOR INTENT MATCHING (read carefully):
1. First, check if the message is an actionable command or request. If the user is just stating a fact, expressing an inability (e.g., "I don't remember"), chatting, or if it is an automated bot reply, choose "ignore".
2. If it is a request for past data (a summary, total, or report), choose "report". (Note: if they ask for a report of a specific category, it is still a "report").
3. If it is an interaction to configure the categories (e.g., creating, deleting, or listing available categories), choose "category".
4. If it is logging a new purchase/bill (can be a short phrase with an amount), choose "expense".
5. If it is altering a past expense, choose "modification".

Intents:
- expense: logging a new purchase or bill.
- report: requesting to calculate or show past expenses.
- category: managing the list of available categories.
- modification: changing or undoing a past expense.
- ignore: conversational noise, statements, or bot replies.

Message: ${text}`;
