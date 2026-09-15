import { TIME_ZONE } from "../../../../constants.js";
import { getReferenceDate } from "../../../../lib/dates.js";
import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import { isUserInputError, UserInputError } from "../../../../worker/errors.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../../../worker/types.js";
import { formatTrainingList } from "./format.js";
import { parseTrainingReport } from "./parser.js";
import { listTrainingEntriesByDay } from "./queries.js";
import {
  trainingReportParamsSchema,
  type TrainingReportParams,
} from "./schema.js";

export async function handleTrainingReport(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const params = await analyzeTrainingReport(deps, context);
    return await persistTrainingReport(deps.db, context.rawText, params);
  } catch (error: unknown) {
    if (isUserInputError(error)) {
      return {
        kind: "success",
        message: error.userMessage,
      };
    }
    throw error;
  }
}

export async function analyzeTrainingReport(
  deps: AppDeps,
  context: MessageContext,
): Promise<TrainingReportParams> {
  const currentDateStr = getReferenceDate(
    TIME_ZONE,
    deps.now?.() ?? new Date(),
  );
  return parseTrainingReport(deps.config, context.rawText, currentDateStr);
}

export async function persistTrainingReport(
  db: QueryCreator<AppDatabase>,
  rawText: string,
  params: TrainingReportParams,
): Promise<HandlerResult> {
  if (containsPromptInjectionMarker(rawText)) {
    throw new UserInputError(
      "Please send the training report request without embedded instructions.",
    );
  }

  const safeParams = validateTrainingReportParams(params);
  const entries = await listTrainingEntriesByDay(
    db,
    { start: safeParams.start_date, end: safeParams.end_date },
    safeParams.exercise,
  );

  return {
    kind: "success",
    message: formatTrainingList(safeParams.title, entries),
  };
}

function validateTrainingReportParams(
  params: TrainingReportParams,
): TrainingReportParams {
  const result = trainingReportParamsSchema.safeParse(params);
  if (!result.success) {
    throw new UserInputError(
      "Could not understand that training report request. Please try again.",
      result.error,
    );
  }
  return result.data;
}
