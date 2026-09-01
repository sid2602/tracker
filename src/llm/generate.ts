import { generateObject } from "ai";
import type { z } from "zod";
import type { Config } from "../config.js";
import { withRetry } from "../lib/retry.js";
import { getModel } from "./provider.js";

export async function generateStructured<T>(
  config: Config,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  prompt: string,
): Promise<T> {
  return withRetry(async () => {
    const { object } = await generateObject({
      model: getModel(config),
      schema,
      prompt,
    });

    return object;
  });
}
