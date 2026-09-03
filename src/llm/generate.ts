import { generateObject } from "ai";
import type { z } from "zod";
import type { Config } from "../config.js";
import { withRetry } from "../lib/retry.js";
import { withLlmSpan } from "../tracing.js";
import { getModel } from "./provider.js";

export async function generateStructured<T>(
  config: Config,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  prompt: string,
  operation: string,
): Promise<T> {
  return withLlmSpan(operation, config, prompt, async () => {
    const result = await withRetry(async () => {
      const generated = await generateObject({
        model: getModel(config),
        schema,
        prompt,
      });

      return {
        value: generated.object,
        usage: generated.usage,
      };
    });

    return result;
  });
}
