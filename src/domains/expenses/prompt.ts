import { TIME_ZONE } from "../../constants.js";

export const getExpensesPrompt = (
  text: string,
  referenceDate: string,
  categories: { name: string, description: string | null }[],
) => {
  const formattedCategories = categories.length > 0 
    ? categories.map((c) => c.description ? `${c.name} (${c.description})` : c.name).join(", ")
    : "none";

  return `Extract expenses from the user message.
The message may be in any language.
Reference date: ${referenceDate} (${TIME_ZONE}).
If no date is given, use today.
Handle relative dates such as "yesterday" / "wczoraj" and dates written in the text.
Store amounts in minor units as amountCents (for example 15 PLN = 1500).
Use ISO 4217 currency codes (e.g. PLN, EUR). If the currency is explicitly mentioned, extract it. If unspecified, set currency to JSON primitive null (NOT the string "null").
Allowed categories: ${formattedCategories}.
Write note in the same language as the message; keep it short.
One message may contain multiple items in the items array.
If the message indicates a split or a sub-item (e.g., "200 total, including 50 for X" or "200 w tym 50 na X"), you MUST perform subtraction so the sum of all items equals the given total (e.g., create one item for 150 and one for 50).
Message: ${text}`;
};
