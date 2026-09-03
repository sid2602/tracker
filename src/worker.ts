import { loadConfig } from "./config.js";
import { initSchema, openDatabase } from "./db/connection.js";
import { listenForMessages, parseEnvelope, sendMessage } from "./signal/index.js";
import {
  initTracing,
  shutdownTracing,
  withMessageTrace,
} from "./tracing.js";
import { processMessage } from "./worker/dispatch.js";
import type { AppDeps, HandlerResult, MessageContext } from "./worker/types.js";

function log(message: string): void {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

export async function handleIncomingPayload(
  deps: AppDeps,
  payload: unknown,
): Promise<void> {
  const context = parseEnvelope(payload);
  if (!context) {
    return;
  }

  log(
    `received from ${context.sourceAuthor}: ${JSON.stringify(context.rawText)}`,
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
        log(`reply sent to ${context.sourceAuthor}`);
      } catch (error) {
        console.warn(
          `[${new Date().toISOString()}] Failed to process Signal message`,
          error,
        );
      }
    },
  );
}

function logResult(context: MessageContext, result: HandlerResult): void {
  switch (result.kind) {
    case "silent":
      log(`ignored: ${JSON.stringify(context.rawText)}`);
      break;
    case "success":
      log(`success: ${JSON.stringify(result.message)}`);
      break;
    case "failure":
      log(`failure: ${JSON.stringify(result.message)}`);
      break;
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  await initTracing(config);

  const db = openDatabase(config.databasePath);
  initSchema(db);
  const deps: AppDeps = { db, config };

  log(
    `worker started db=${config.databasePath} model=${config.llmProvider}/${config.llmModel} tracing=${
      config.langfusePublicKey && config.langfuseSecretKey ? "on" : "off"
    }`,
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
  console.error(error);
  process.exitCode = 1;
});
