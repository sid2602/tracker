import { describe, expect, it } from "vitest";
import { loadConfig } from "../config.js";
import { routeMessage } from "./router.js";
import type { RouterResult } from "./schema.js";

const ROUTER_EVALS: { input: string; expected: RouterResult["intent"] }[] = [
  // Expense (Wydatki)
  { input: "kawa i ciastko 25 zl", expected: "expense" },
  { input: "zaplacilem rachunek za prad 120.50", expected: "expense" },
  { input: "coffee and cake 25", expected: "expense" },
  { input: "paid the electricity bill 120.50", expected: "expense" },
  { input: "300 mechanik", expected: "expense" },
  { input: "300 car mechanic", expected: "expense" },

  // Report (Raporty)
  { input: "ile wydalem w tym miesiacu?", expected: "report" },
  { input: "podsumowanie wydatkow za wrzesien", expected: "report" },
  { input: "how much did I spend this month?", expected: "report" },
  { input: "september expense report", expected: "report" },
  { input: "raport kategoria jedzenie", expected: "report" },
  { input: "report for groceries", expected: "report" },

  // Category (Kategorie)
  { input: "dodaj nowa kategorie dom", expected: "category" },
  { input: "usun kategorie rozrywka", expected: "category" },
  { input: "add category home", expected: "category" },
  { input: "delete category entertainment", expected: "category" },
  { input: "pokaz moje kategorie", expected: "category" },
  { input: "list my categories", expected: "category" },

  // Modification (Modyfikacje)
  { input: "zmien poprzedni wpis", expected: "modification" },
  { input: "cofnij ostatni wydatek", expected: "modification" },
  { input: "change previous entry", expected: "modification" },
  { input: "undo the last expense", expected: "modification" },
  { input: "usun wydatek na kawe", expected: "modification" },
  { input: "delete the coffee expense", expected: "modification" },

  // Ignore (Ignoruj - bot replies and chatter)
  { input: "✅ Zapisano 1 wpis", expected: "ignore" },
  { input: "hej, co tam?", expected: "ignore" },
  { input: "✅ Saved 1 item", expected: "ignore" },
  { input: "hello, how are you?", expected: "ignore" },
  { input: "Nie pamietam ile wydalem", expected: "ignore" },
];

describe.runIf(process.env.RUN_EVALS === "true")("LLM Router Evals", () => {
  let config: ReturnType<typeof loadConfig>;

  try {
    config = loadConfig();
  } catch (error) {
    if (process.env.RUN_EVALS === "true") {
      console.error(
        "Could not load config for evals. Ensure .env has valid API keys (e.g., AI_GATEWAY_API_KEY).",
      );
      throw error;
    }
  }

  it.each(ROUTER_EVALS)(
    'correctly routes "$input" -> $expected',
    async ({ input, expected }) => {
      const result = await routeMessage(config, input);
      expect(result.intent).toBe(expected);
    },
    15000, // 15 seconds timeout per LLM request
  );
});
