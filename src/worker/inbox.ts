import { logger } from "../lib/logger.js";
import { classifyEnvelope } from "../signal/index.js";
import { insertInboxRecord } from "./inbox/storage.js";
import type { AppDeps } from "./types.js";

export {
  processNextInboxItem,
} from "./inbox/processor.js";
export type { InboxProcessorOptions } from "./inbox/policy.js";
export { runInboxProcessor } from "./inbox/runner.js";

export async function saveToInbox(
  deps: AppDeps,
  payload: unknown,
): Promise<void> {
  const classification = classifyEnvelope(payload, {
    selfNumber: deps.config.signalPhoneNumber,
    allowedInputDeviceIds: deps.config.signalAllowedInputDeviceIds,
  });
  if (classification.kind !== "inbound") {
    logger.info(
      { kind: classification.kind },
      "Ignoring non-inbound Signal payload",
    );
    return;
  }
  const context = classification.context;

  const rawEnvelope = JSON.stringify(payload);
  if (!rawEnvelope) {
    throw new Error("Could not serialize Signal payload");
  }

  const now = deps.now?.() ?? new Date();
  await insertInboxRecord(deps, context, rawEnvelope, now.getTime());

  logger.info(
    {
      messageKey: context.messageKey,
      sourceAuthor: context.sourceAuthor,
    },
    "saved to inbox",
  );
}
