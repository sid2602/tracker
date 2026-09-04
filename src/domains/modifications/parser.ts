import type { Config } from "../../config.js";
import { generateStructured } from "../../llm/generate.js";
import { getModificationPrompt } from "./prompt.js";
import { modificationResultSchema, type ModificationResult } from "./schema.js";

export async function parseModification(
  config: Config,
  text: string,
): Promise<ModificationResult> {
  const result = await generateStructured(
    config,
    modificationResultSchema,
    getModificationPrompt(text),
    "llm.modification",
  );

  return modificationResultSchema.parse(result);
}
