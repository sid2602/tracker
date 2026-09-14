import type { Config } from "../../../../config.js";
import { generateStructured } from "../../../../llm/generate.js";
import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import { UserInputError } from "../../../../worker/errors.js";
import { tryParseDeterministicSetCorrection } from "./deterministic.js";
import { getTrainingModificationPrompt } from "./prompt.js";
import {
  trainingModificationResultSchema,
  type TrainingModificationResult,
} from "./schema.js";

export async function parseTrainingModification(
  config: Config,
  text: string,
  referenceDate: string,
): Promise<TrainingModificationResult> {
  if (containsPromptInjectionMarker(text)) {
    throw new UserInputError(
      "Please send the training edit without embedded instructions.",
    );
  }

  const deterministic = tryParseDeterministicSetCorrection(text);
  if (deterministic !== null) {
    return trainingModificationResultSchema.parse(deterministic);
  }

  const result = await generateStructured(
    config,
    trainingModificationResultSchema,
    getTrainingModificationPrompt(text, referenceDate),
    "llm.training.modification",
  );

  const parsed = trainingModificationResultSchema.safeParse(result);
  if (!parsed.success) {
    throw new UserInputError(
      "Please identify one training entry by ID or provide an unambiguous set correction.",
      parsed.error,
    );
  }

  return parsed.data;
}
