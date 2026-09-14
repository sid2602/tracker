import {
  analyzeTrainingLog,
  handleTrainingLog,
  persistTrainingLog,
} from "./domains/entries/index.js";
import {
  analyzeTrainingReport,
  handleTrainingReport,
  persistTrainingReport,
} from "./domains/reports/index.js";
import { trainingLogResultSchema } from "./domains/entries/schema.js";
import { trainingReportParamsSchema } from "./domains/reports/schema.js";
import { trainingLogRoutingCard } from "./domains/entries/routing.js";
import { trainingReportRoutingCard } from "./domains/reports/routing.js";
import type { ProductModule } from "../types.js";

export const trainingProduct: ProductModule = {
  id: "training",
  routingCards: [trainingReportRoutingCard, trainingLogRoutingCard],
  analyzeByIntent: {
    "training.log": analyzeTrainingLog,
    "training.report": analyzeTrainingReport,
  },
  persistByIntent: {
    "training.log": async (deps, context, parsed, db = deps.db) =>
      persistTrainingLog(db, context, trainingLogResultSchema.parse(parsed)),
    "training.report": async (deps, context, parsed, db = deps.db) =>
      persistTrainingReport(
        db,
        context.rawText,
        trainingReportParamsSchema.parse(parsed),
      ),
  },
  handleByIntent: {
    "training.log": handleTrainingLog,
    "training.report": handleTrainingReport,
  },
};
