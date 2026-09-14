import type { Config } from "../../../../config.js";
import { generateStructured } from "../../../../llm/generate.js";
import { containsPromptInjectionMarker } from "../../../../llm/prompt-data.js";
import { UserInputError } from "../../../../worker/errors.js";
import { getTrainingReportPrompt } from "./prompt.js";
import {
  trainingReportParamsSchema,
  type TrainingReportParams,
} from "./schema.js";

export async function parseTrainingReport(
  config: Config,
  text: string,
  referenceDate: string,
): Promise<TrainingReportParams> {
  if (containsPromptInjectionMarker(text)) {
    throw new UserInputError(
      "Please send the training report request without embedded instructions.",
    );
  }

  const result = await generateStructured(
    config,
    trainingReportParamsSchema,
    getTrainingReportPrompt(text, referenceDate),
    "llm.training.report",
  );

  return trainingReportParamsSchema.parse(result);
}
