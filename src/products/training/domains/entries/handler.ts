import { TIME_ZONE } from "../../../../constants.js";
import { getReferenceDate } from "../../../../lib/dates.js";
import { logger } from "../../../../lib/logger.js";
import { MESSAGE_ALREADY_SAVED, savedItemsMessage } from "../../../../lib/messages.js";
import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import { isUserInputError, UserInputError } from "../../../../worker/errors.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../../../worker/types.js";
import { parseTrainingLog } from "./parser.js";
import {
  insertTrainingEntries,
  type TrainingEntryInput,
} from "./repository.js";
import {
  trainingLogResultSchema,
  type TrainingLogEntry,
  type TrainingLogResult,
} from "./schema.js";

export async function handleTrainingLog(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const parsed = await analyzeTrainingLog(deps, context);
    return await deps.db.transaction().execute((trx) =>
      persistTrainingLog(trx, context, parsed),
    );
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

export async function analyzeTrainingLog(
  deps: AppDeps,
  context: MessageContext,
): Promise<TrainingLogResult> {
  const referenceDate = getReferenceDate(TIME_ZONE, deps.now?.() ?? new Date());
  return parseTrainingLog(deps.config, context.rawText, referenceDate);
}

export async function persistTrainingLog(
  db: QueryCreator<AppDatabase>,
  context: MessageContext,
  parsed: TrainingLogResult,
): Promise<HandlerResult> {
  const safeParsed = trainingLogResultSchema.parse(parsed);
  if (containsPromptInjectionMarker(context.rawText)) {
    throw new UserInputError(
      "Please send the training log without embedded instructions.",
    );
  }

  const entries = expandTrainingEntries(safeParsed, context);
  const { inserted } = await insertTrainingEntries(db, entries);

  logger.info(
    { details: formatTrainingDetails(entries) },
    "training entry details",
  );

  if (inserted === 0) {
    return {
      kind: "success",
      message: MESSAGE_ALREADY_SAVED,
      insertedCount: 0,
    };
  }

  return {
    kind: "success",
    message: savedItemsMessage(inserted),
    insertedCount: inserted,
  };
}

export function expandTrainingEntries(
  parsed: TrainingLogResult,
  context: MessageContext,
): TrainingEntryInput[] {
  const expanded: TrainingEntryInput[] = [];

  for (const entry of parsed.entries) {
    const rows = expandOneEntry(entry);
    for (const row of rows) {
      expanded.push({
        sourceMessageKey: context.messageKey,
        sourceAuthor: context.sourceAuthor,
        sourceTimestamp: context.sourceTimestamp,
        itemIndex: expanded.length,
        occurredOn: entry.occurredOn,
        exercise: entry.exercise,
        setIndex: row.setIndex,
        reps: entry.reps,
        weightGrams: entry.weightGrams,
        durationSeconds: entry.durationSeconds,
        kind: entry.kind,
        note: entry.note,
        rawText: context.rawText,
      });
    }
  }

  return expanded;
}

function expandOneEntry(
  entry: TrainingLogEntry,
): Array<{ setIndex: number | null }> {
  if (entry.setsCount !== null && entry.setsCount >= 1) {
    return Array.from({ length: entry.setsCount }, (_, index) => ({
      setIndex: index + 1,
    }));
  }

  return [{ setIndex: entry.setIndex }];
}

function formatTrainingDetails(entries: TrainingEntryInput[]): string {
  return entries
    .map((entry) => {
      const parts = [entry.exercise];
      if (entry.setIndex !== null) {
        parts.push(`set ${entry.setIndex}`);
      }
      if (entry.reps !== null) {
        parts.push(`${entry.reps} reps`);
      }
      if (entry.weightGrams !== null) {
        parts.push(`${(entry.weightGrams / 1000).toFixed(1)} kg`);
      }
      if (entry.durationSeconds !== null) {
        parts.push(`${entry.durationSeconds}s`);
      }
      return parts.join(" ");
    })
    .join("; ");
}
