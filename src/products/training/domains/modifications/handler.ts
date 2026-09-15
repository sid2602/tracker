import { TIME_ZONE } from "../../../../constants.js";
import { getReferenceDate } from "../../../../lib/dates.js";
import { logger } from "../../../../lib/logger.js";
import { isUserInputError, UserInputError } from "../../../../worker/errors.js";
import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../../../../db/schema.js";
import type { AppDeps, HandlerResult, MessageContext } from "../../../../worker/types.js";
import { formatTrainingEntryFields } from "../shared/format-entry.js";
import { toTrainingEntryView, type TrainingEntryRow } from "../entries/repository.js";
import {
  deleteTrainingEntry,
  getLastTrainingEntry,
  getTrainingEntryById,
  listTrainingEntriesForAuthorOnDay,
  resolveCorrectableSetEntry,
  updateTrainingEntryFields,
} from "./repository.js";
import { parseTrainingModification } from "./parser.js";
import {
  trainingModificationResultSchema,
  type TrainingModificationResult,
} from "./schema.js";

export async function handleTrainingModification(
  deps: AppDeps,
  context: MessageContext,
): Promise<HandlerResult> {
  try {
    const modification = await analyzeTrainingModification(deps, context);
    return await deps.db.transaction().execute((trx) =>
      persistTrainingModification(
        trx,
        context,
        modification,
        deps.now?.() ?? new Date(),
      ),
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

export async function analyzeTrainingModification(
  deps: AppDeps,
  context: MessageContext,
): Promise<TrainingModificationResult> {
  const referenceDate = getReferenceDate(
    TIME_ZONE,
    deps.now?.() ?? new Date(),
  );
  return parseTrainingModification(deps.config, context.rawText, referenceDate);
}

export async function persistTrainingModification(
  db: QueryCreator<AppDatabase>,
  context: MessageContext,
  modification: TrainingModificationResult,
  now: Date = new Date(),
): Promise<HandlerResult> {
  const safe = validateTrainingModification(modification);
  logger.info({ modification: safe }, "parsed training modification");

  if (safe.action === "correct_set") {
    return applySetCorrection(db, context, safe, now);
  }

  const entry = await resolveTargetEntry(db, context.sourceAuthor, safe);
  if (entry === undefined) {
    return {
      kind: "success",
      message: "Could not find any training entry matching this description.",
    };
  }

  if (safe.action === "delete") {
    const deleted = await deleteTrainingEntry(
      db,
      context.sourceAuthor,
      entry.id,
    );
    if (!deleted) {
      throw new UserInputError(
        "The training entry changed before it could be deleted. Please try again.",
      );
    }
    return {
      kind: "success",
      message: `Deleted training entry #${entry.id} (${entry.exercise}).`,
    };
  }

  const payload = safe.updatePayload;
  if (payload === null) {
    throw new UserInputError(
      "Please specify what should be changed in the training entry.",
    );
  }

  const updated = await updateTrainingEntryFields(
    db,
    context.sourceAuthor,
    entry.id,
    payload,
  );
  if (!updated) {
    throw new UserInputError(
      "The training entry could not be updated. Please try again.",
    );
  }

  return {
    kind: "success",
    message: `Updated training entry #${entry.id}.`,
  };
}

async function applySetCorrection(
  db: QueryCreator<AppDatabase>,
  context: MessageContext,
  modification: TrainingModificationResult,
  now: Date,
): Promise<HandlerResult> {
  const payload = modification.updatePayload;
  if (payload === null) {
    throw new UserInputError(
      "Please specify the corrected reps, weight, or duration.",
    );
  }

  const occurredOn = getReferenceDate(TIME_ZONE, now);
  const dayEntries = await listTrainingEntriesForAuthorOnDay(
    db,
    context.sourceAuthor,
    occurredOn,
  );
  const entry = resolveCorrectableSetEntry(dayEntries, modification.setIndex);
  if (entry === undefined) {
    return {
      kind: "success",
      message:
        "Could not find a training set to correct today. Log sets first, then correct them.",
    };
  }

  const updated = await updateTrainingEntryFields(
    db,
    context.sourceAuthor,
    entry.id,
    payload,
  );
  if (!updated) {
    throw new UserInputError(
      "The training set could not be updated. Please try again.",
    );
  }

  return {
    kind: "success",
    message: formatCorrectionMessage(entry, payload.reps),
  };
}

async function resolveTargetEntry(
  db: QueryCreator<AppDatabase>,
  sourceAuthor: string,
  modification: TrainingModificationResult,
): Promise<TrainingEntryRow | undefined> {
  if (modification.target === "id") {
    if (modification.id === null) {
      return undefined;
    }
    return getTrainingEntryById(db, sourceAuthor, modification.id);
  }

  if (modification.target === "last") {
    return getLastTrainingEntry(db, sourceAuthor);
  }

  return undefined;
}

function formatCorrectionMessage(
  entry: TrainingEntryRow,
  reps: number | null,
): string {
  const view = toTrainingEntryView(entry);
  const base = formatTrainingEntryFields({
    exercise: view.exercise,
    setIndex: view.setIndex,
    reps: null,
    weightGrams: null,
    durationSeconds: null,
  });
  if (reps === null) {
    return `Updated ${base}.`;
  }
  return `Updated ${base} to ${reps} reps.`;
}

function validateTrainingModification(
  modification: TrainingModificationResult,
): TrainingModificationResult {
  const result = trainingModificationResultSchema.safeParse(modification);
  if (!result.success) {
    throw new UserInputError(
      "Please identify one training entry by ID or provide an unambiguous set correction.",
      result.error,
    );
  }
  return result.data;
}
