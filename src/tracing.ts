import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  startActiveObservation,
  updateActiveObservation,
} from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";
import type { Config } from "./config.js";
import { logger } from "./lib/logger.js";

type TraceMetadata = Record<string, string | number | boolean | null>;

let tracingEnabled = false;
let otelSdk: NodeSDK | null = null;
let spanProcessor: LangfuseSpanProcessor | null = null;

export function isTracingEnabled(): boolean {
  return tracingEnabled;
}

export async function initTracing(config: Config): Promise<void> {
  if (!config.langfusePublicKey || !config.langfuseSecretKey) {
    tracingEnabled = false;
    return;
  }

  try {
    spanProcessor = new LangfuseSpanProcessor({
      publicKey: config.langfusePublicKey,
      secretKey: config.langfuseSecretKey,
      baseUrl: config.langfuseBaseUrl,
    });

    otelSdk = new NodeSDK({
      spanProcessors: [spanProcessor],
    });
    otelSdk.start();
    tracingEnabled = true;
  } catch (error) {
    tracingEnabled = false;
    otelSdk = null;
    spanProcessor = null;
    logger.warn({ error }, "Langfuse tracing init failed");
  }
}

export async function shutdownTracing(): Promise<void> {
  if (!otelSdk && !spanProcessor) {
    return;
  }

  try {
    await spanProcessor?.forceFlush();
    await otelSdk?.shutdown();
  } catch (error) {
    logger.warn({ error }, "Langfuse tracing shutdown failed");
  } finally {
    tracingEnabled = false;
    otelSdk = null;
    spanProcessor = null;
  }
}

export async function withMessageTrace<T>(
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  if (!tracingEnabled) {
    return fn();
  }

  return startActiveObservation("signal-message", async () => {
    try {
      updateActiveObservation({ input });
    } catch (error) {
      logger.warn({ error }, "Langfuse message input update failed");
    }
    return fn();
  });
}

export function recordMessageTrace(update: {
  metadata?: TraceMetadata;
  output?: unknown;
}): void {
  if (!tracingEnabled) {
    return;
  }

  try {
    updateActiveObservation({
      ...(update.output !== undefined ? { output: update.output } : {}),
      ...(update.metadata ? { metadata: update.metadata } : {}),
    });
  } catch (error) {
    logger.warn({ error }, "Langfuse message trace update failed");
  }
}

export async function withLlmSpan<T>(
  operation: string,
  config: Config,
  input: unknown,
  fn: () => Promise<{
    value: T;
    usage?: {
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    };
  }>,
): Promise<T> {
  if (!tracingEnabled) {
    const { value } = await fn();
    return value;
  }

  return startActiveObservation(
    operation,
    async () => {
      try {
        const { value, usage } = await fn();
        try {
          updateActiveObservation(
            {
              input,
              output: value,
              model: config.llmModel,
              metadata: {
                provider: config.llmProvider,
                model: config.llmModel,
                validation: "ok",
              },
              usageDetails: buildUsageDetails(usage),
            },
            { asType: "generation" },
          );
        } catch (error) {
          logger.warn({ error }, "Langfuse generation update failed");
        }
        return value;
      } catch (error) {
        try {
          updateActiveObservation(
            {
              input,
              model: config.llmModel,
              metadata: {
                provider: config.llmProvider,
                model: config.llmModel,
                validation: "fail",
              },
              level: "ERROR",
              statusMessage:
                error instanceof Error ? error.message : "LLM call failed",
            },
            { asType: "generation" },
          );
        } catch (updateError) {
          logger.warn({ error: updateError }, "Langfuse generation update failed");
        }
        throw error;
      }
    },
    { asType: "generation" },
  );
}

function buildUsageDetails(usage?: {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}): Record<string, number> | undefined {
  const usageDetails: Record<string, number> = {};

  if (typeof usage?.inputTokens === "number") {
    usageDetails.input = usage.inputTokens;
  }
  if (typeof usage?.outputTokens === "number") {
    usageDetails.output = usage.outputTokens;
  }
  if (typeof usage?.totalTokens === "number") {
    usageDetails.total = usage.totalTokens;
  }

  return Object.keys(usageDetails).length > 0 ? usageDetails : undefined;
}
