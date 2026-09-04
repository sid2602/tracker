export const getCategoryPrompt = (text: string) => `Analyze the user message regarding expense categories.
Determine if the user wants to:
1. 'list' the current categories (e.g., "what categories do I have?", "show categories").
2. 'add' a new category (e.g., "add subscriptions category").
3. 'remove' an existing category (e.g., "delete food category").

If adding or removing, extract the categoryName in lowercase.
If listing, categoryName can be null.

Message: ${text}`;
