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
Use ISO 4217 currency codes; set currency to null when unspecified (defaults to PLN).
Allowed categories: ${formattedCategories}.
Write note in the same language as the message; keep it short.
One message may contain multiple items in the items array.

Message: ${text}`;
};
