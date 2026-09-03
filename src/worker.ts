import { loadConfig } from "./config.js";
import { logger } from "./lib/logger.js";
import { initSchema, openDatabase } from "./db/connection.js";
import { listenForMessages } from "./signal/index.js";
import {
  initTracing,
  shutdownTracing,
} from "./tracing.js";
import type { AppDeps } from "./worker/types.js";
import { runInboxProcessor, saveToInbox } from "./worker/inbox.js";

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

  const abortController = new AbortController();
  let shuttingDown = false;

  const onShutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("shutting down worker...");
    abortController.abort();
  };
  
  process.once("SIGINT", onShutdown);
  process.once("SIGTERM", onShutdown);

  const inboxTask = runInboxProcessor(deps, abortController.signal);

  listenForMessages(config, async (payload) => {
    await saveToInbox(deps, payload);
  }, { signal: abortController.signal }).catch((err) => {
    logger.error({ err }, "Fatal error in listenForMessages");
    process.exit(1);
  });

  await inboxTask;

  await shutdownTracing();
  await deps.db.destroy();
  logger.info("worker stopped");
}

void main().catch((error: unknown) => {
  logger.error({ error }, "Fatal error");
  process.exitCode = 1;
});
