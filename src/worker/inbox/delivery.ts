import { sendMessage } from "../../signal/index.js";
import { logger } from "../../lib/logger.js";
import type { AppDeps, MessageContext } from "../types.js";

export async function deliverSavedItem(
  deps: AppDeps,
  messageKey: string,
  context: MessageContext,
  responseText: string | null,
  leaseToken: string,
): Promise<void> {
  if (!responseText) {
    throw new Error("Saved inbox item has no response text");
  }

  await sendMessage(deps.config, context.sourceAuthor, responseText);

  const confirmed = await deps.db
    .updateTable("inbox")
    .set({
      status: "confirmed",
      lease_token: null,
      lease_until: null,
      next_attempt_at: null,
    })
    .where("message_key", "=", messageKey)
    .where("status", "=", "saved")
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (confirmed.numUpdatedRows === 0n) {
    logger.warn({ messageKey }, "Response sent but inbox confirmation lost its lease");
  }
}
