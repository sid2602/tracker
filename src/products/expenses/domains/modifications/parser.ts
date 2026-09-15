import type { Config } from "../../../../config.js";
import { generateStructured } from "../../../../llm/generate.js";
import { getModificationPrompt } from "./prompt.js";
import { modificationResultSchema, type ModificationResult } from "./schema.js";
import { UserInputError } from "../../../../worker/errors.js";
import { validateModificationAgainstRawText } from "./validation.js";

export async function parseModification(
  config: Config,
  text: string,
  referenceDate: string,
): Promise<ModificationResult> {
  const result = await generateStructured(
    config,
    modificationResultSchema,
    getModificationPrompt(text, referenceDate),
    "llm.modification",
  );

  const parsed = modificationResultSchema.safeParse(result);
  if (!parsed.success) {
    throw new UserInputError(
      "Please identify one expense by ID or provide unambiguous details.",
      parsed.error,
    );
  }

  validateModificationAgainstRawText(text, parsed.data, referenceDate);
  return parsed.data;
}
