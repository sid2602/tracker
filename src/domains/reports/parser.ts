import type { Config } from "../../config.js";
import { generateStructured } from "../../llm/generate.js";
import { containsPromptInjectionMarker } from "../../llm/prompt-data.js";
import { UserInputError } from "../../worker/errors.js";
import { getReportPrompt } from "./prompt.js";
import { reportParamsSchema, type ReportParams } from "./schema.js";

export async function parseReport(
  config: Config,
  text: string,
  currentDateStr: string,
): Promise<ReportParams> {
  if (containsPromptInjectionMarker(text)) {
    throw new UserInputError(
      "Please send the report request without embedded instructions.",
    );
  }

  const result = await generateStructured(
    config,
    reportParamsSchema,
    getReportPrompt(text, currentDateStr),
    "llm.report.parse",
  );

  return result;
}
