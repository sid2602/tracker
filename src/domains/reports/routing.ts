import type { RoutingCard } from "../../routing/routing-types.js";

export const reportRoutingCard: RoutingCard = {
  intent: "report",
  object: "recorded expenses from a past or current period",
  goal: "read or summarize stored expenses",
  localRules: [
    "Use for totals, summaries, reports, lists, itemized details, category filters, and category breakdowns.",
    "A missing date is allowed; the report domain applies its current-month default.",
  ],
  examples: [
    "ile wydałem w tym miesiącu?",
    "list my expenses yesterday",
    "Wie viel habe ich diesen Monat ausgegeben?",
    "Muestra mis gastos de esta semana",
    "Скільки я витратив цього місяця?",
  ],
};
