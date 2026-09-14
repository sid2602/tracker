import {
  analyzeCategory,
  handleCategory,
  persistCategory,
} from "./domains/categories/index.js";
import {
  analyzeExpense,
  handleExpense,
  persistExpense,
} from "./domains/expenses/index.js";
import {
  analyzeModification,
  handleModification,
  persistModification,
} from "./domains/modifications/index.js";
import {
  analyzeReport,
  handleReport,
  persistReport,
} from "./domains/reports/index.js";
import { categoryActionSchema } from "./domains/categories/schema.js";
import { expenseResultSchema } from "./domains/expenses/schema.js";
import { modificationResultSchema } from "./domains/modifications/schema.js";
import { reportParamsSchema } from "./domains/reports/schema.js";
import { categoryRoutingCard } from "./domains/categories/routing.js";
import { expenseRoutingCard } from "./domains/expenses/routing.js";
import { modificationRoutingCard } from "./domains/modifications/routing.js";
import { reportRoutingCard } from "./domains/reports/routing.js";
import type { ProductModule } from "../types.js";

export const expensesProduct: ProductModule = {
  id: "expenses",
  routingCards: [
    categoryRoutingCard,
    modificationRoutingCard,
    reportRoutingCard,
    expenseRoutingCard,
  ],
  analyzeByIntent: {
    "expenses.create": analyzeExpense,
    "expenses.report": analyzeReport,
    "expenses.category": analyzeCategory,
    "expenses.modification": analyzeModification,
  },
  persistByIntent: {
    "expenses.create": async (deps, context, parsed, db = deps.db) =>
      persistExpense(db, context, expenseResultSchema.parse(parsed)),
    "expenses.report": async (deps, context, parsed, db = deps.db) =>
      persistReport(db, context.rawText, reportParamsSchema.parse(parsed)),
    "expenses.category": async (deps, context, parsed, db = deps.db) =>
      persistCategory(db, context.rawText, categoryActionSchema.parse(parsed)),
    "expenses.modification": async (deps, context, parsed, db = deps.db) =>
      persistModification(
        db,
        context,
        modificationResultSchema.parse(parsed),
      ),
  },
  handleByIntent: {
    "expenses.create": handleExpense,
    "expenses.report": handleReport,
    "expenses.category": handleCategory,
    "expenses.modification": handleModification,
  },
};
