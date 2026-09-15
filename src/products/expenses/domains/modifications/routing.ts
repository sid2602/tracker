import type { RoutingCard } from "../../../../routing/routing-types.js";

export const modificationRoutingCard: RoutingCard = {
  intent: "expenses.modification",
  object: "an expense that already exists",
  goal: "change or remove an existing expense",
  localRules: [
    "Recognize references such as last, previous, the first one today, an explicit ID such as #42, or a specific expense description.",
    "Undo, delete, edit, change, correct, and update requests about an existing expense are modifications.",
  ],
  examples: [
    "cofnij ostatni wydatek",
    "change previous entry",
    "Lösche den letzten Eintrag",
    "borra el último gasto",
    "Зміни витрату #42",
  ],
};
