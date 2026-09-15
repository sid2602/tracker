import type { Config } from "../../../../config.js";
import { generateStructured } from "../../../../llm/generate.js";
import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import { UserInputError } from "../../../../worker/errors.js";
import { assertNotSetCorrectionMisroute } from "./correction-guard.js";
import { normalizeTrainingLogDates } from "./date-normalize.js";
import { getTrainingLogPrompt } from "./prompt.js";
import {
  trainingLogResultSchema,
  type TrainingLogResult,
} from "./schema.js";

export async function parseTrainingLog(
  config: Config,
  text: string,
  referenceDate: string,
): Promise<TrainingLogResult> {
  if (containsPromptInjectionMarker(text)) {
    throw new UserInputError(
      "Please send the training log without embedded instructions.",
    );
  }
  assertNotSetCorrectionMisroute(text);

  const result = await generateStructured(
    config,
    trainingLogResultSchema,
    getTrainingLogPrompt(text, referenceDate),
    "llm.training.log",
  );

  const parsed = trainingLogResultSchema.parse(result);
  return normalizeTrainingLogDates(parsed, text, referenceDate);
}
