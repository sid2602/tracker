import { categoryRoutingCard } from "../domains/categories/routing.js";
import { modificationRoutingCard } from "../domains/modifications/routing.js";
import { expenseRoutingCard } from "../domains/expenses/routing.js";
import { reportRoutingCard } from "../domains/reports/routing.js";
import type { RoutingCard } from "./routing-types.js";

export const ROUTING_CARDS: readonly RoutingCard[] = [
  categoryRoutingCard,
  modificationRoutingCard,
  reportRoutingCard,
  expenseRoutingCard,
];
