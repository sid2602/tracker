import { loadConfig } from "./config.js";
import { logger } from "./lib/logger.js";
import { initSchema, openDatabase } from "./db/connection.js";
import { listenForMessages, parseEnvelope, sendMessage } from "./signal/index.js";
import {
  initTracing,
  shutdownTracing,
  withMessageTrace,
} from "./tracing.js";
import { processMessage } from "./worker/dispatch.js";
import type { AppDeps, HandlerResult, MessageContext } from "./worker/types.js";



export async function handleIncomingPayload(
  deps: AppDeps,
  payload: unknown,
): Promise<void> {
  const context = parseEnvelope(payload);
  if (!context) {
    return;
  }

  logger.info(
    { sourceAuthor: context.sourceAuthor, rawText: context.rawText },
    "received message",
  );

  await withMessageTrace(
    { text: context.rawText, sourceTimestamp: context.sourceTimestamp },
    async () => {
      try {
        const result = await processMessage(deps, context);
        logResult(context, result);

        if (result.kind === "silent") {
          return;
        }

        await sendMessage(deps.config, context.sourceAuthor, result.message);
        logger.info({ sourceAuthor: context.sourceAuthor }, "reply sent");
      } catch (error) {
        logger.warn({ error }, "Failed to process Signal message");
      }
    },
  );
}

function logResult(context: MessageContext, result: HandlerResult): void {
  switch (result.kind) {
    case "silent":
      logger.info({ rawText: context.rawText }, "ignored");
      break;
    case "success":
      logger.info({ message: result.message }, "success");
      break;
    case "failure":
      logger.info({ message: result.message }, "failure");
      break;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  await initTracing(config);

  const db = openDatabase(config.databasePath);
  await initSchema(db);
  const deps: AppDeps = { db, config };

  logger.info(
    {
      db: config.databasePath,
      model: `${config.llmProvider}/${config.llmModel}`,
      tracing: config.langfusePublicKey && config.langfuseSecretKey ? "on" : "off",
    },
    "worker started",
  );

  const onShutdown = () => {
    void shutdownTracing().finally(() => {
      process.exit(0);
    });
  };
  process.once("SIGINT", onShutdown);
  process.once("SIGTERM", onShutdown);

  await listenForMessages(config, async (payload) => {
    await handleIncomingPayload(deps, payload);
  });
}

void main().catch((error: unknown) => {
  logger.error({ error }, "Fatal error");
  process.exitCode = 1;
});
