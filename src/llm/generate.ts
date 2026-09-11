import { generateObject } from "ai";
import type { z } from "zod";
import type { Config } from "../config.js";
import { withRetry } from "../lib/retry.js";
import { withLlmSpan } from "../tracing.js";
import { getModel } from "./provider.js";
import { UserInputError } from "../worker/errors.js";

const LLM_TIMEOUT_MS = 120_000;

export async function generateStructured<T>(
  config: Config,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  prompt: string,
  operation: string,
): Promise<T> {
  try {
    return await withLlmSpan(operation, config, prompt, async () => {
      const result = await withRetry(async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

        try {
          const generated = await generateObject({
            model: getModel(config),
            schema,
            prompt,
            abortSignal: controller.signal,
          });

          return {
            value: generated.object,
            usage: generated.usage,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      });

      return result;
    });
  } catch (error: unknown) {
    if (
      operation !== "llm.router" &&
      hasErrorName(error, "AI_NoObjectGeneratedError") &&
      hasErrorName(getErrorCause(error), "AI_TypeValidationError")
      && getErrorProperty(error, "finishReason") === "stop"
    ) {
      throw new UserInputError(
        "Could not understand that request. Please provide more details.",
        error,
      );
    }

    throw error;
  }
}

function getErrorCause(error: unknown): unknown {
  return isRecord(error) ? error.cause : undefined;
}

function getErrorProperty(error: unknown, property: string): unknown {
  return isRecord(error) ? error[property] : undefined;
}

function hasErrorName(error: unknown, expectedName: string): boolean {
  if (!isRecord(error)) {
    return false;
  }

  return error.name === expectedName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
