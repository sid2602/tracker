export const getModificationPrompt = (text: string) => `Extract the expense modification intent.
The user message may be in any language.

Determine the action: "delete" or "update".
Determine the target:
- "last": if the user asks to undo or delete the last/most recent expense generally without specifics (e.g. "cofnij", "usuń ostatni", "undo").
- "id": if the user explicitly mentions an ID like "#42" or "numer 42". Extract the integer ID.
- "specific": if the user describes the expense (e.g., "usuń wczorajszą kawę", "usuń ten obiad za 50 zł", "usuń pierwszy z dzisiaj").
Extract searchCriteria if target is "specific".
If the user specifies an amount (e.g., "50 zł"), convert it to cents (e.g., 5000) for amountCents.

Message: ${text}
`;
