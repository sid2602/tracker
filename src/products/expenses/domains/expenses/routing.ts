import type { RoutingCard } from "../../../../routing/routing-types.js";

export const expenseRoutingCard: RoutingCard = {
  intent: "expenses.create",
  object: "a new purchase, bill, or payment",
  goal: "create a new expense record",
  localRules: [
    "A short receipt-like phrase or transaction statement is an expense, even without an imperative verb.",
    "A purchase can still be routed as an expense when the amount is missing; the domain may reject incomplete data later.",
  ],
  examples: [
    "kawa 15 zł",
    "paid 25 PLN for groceries",
    "Kaffee und Kuchen 25 Euro",
    "café y pastel 25 euros",
    "кава 100 гривень",
  ],
};
