import type { Config } from "../../config.js";
import { generateStructured } from "../../llm/generate.js";
import { getReportPrompt } from "./prompt.js";
import { reportParamsSchema, type ReportParams } from "./schema.js";

export async function parseReport(
  config: Config,
  text: string,
  currentDateStr: string,
): Promise<ReportParams> {
  const result = await generateStructured(
    config,
    reportParamsSchema,
    getReportPrompt(text, currentDateStr),
    "llm.report.parse",
  );

  return result;
}
