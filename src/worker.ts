import { loadConfig } from "./config.js";
import { initSchema, openDatabase } from "./db/connection.js";
import { listenForMessages, parseEnvelope, sendMessage } from "./signal/index.js";
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
  const db = openDatabase(config.databasePath);
  initSchema(db);
  const deps: AppDeps = { db, config };

  log(
    `worker started db=${config.databasePath} model=${config.llmProvider}/${config.llmModel}`,
  );

  await listenForMessages(config, async (payload) => {
    await handleIncomingPayload(deps, payload);
  });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
