import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import { logger } from "../../lib/logger.js";
import {
  serializeMessageAnalysis,
  type MessageAnalysis,
} from "../analysis.js";
import type { AppDeps } from "../types.js";
import {
  claimInboxItem,
  selectClaimedInboxItem,
  selectInboxHead,
  type InboxItem,
  type InboxStatus,
} from "./storage.js";

const LEASE_DURATION_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const RETRY_BASE_DELAY_MS = 15_000;
const ACTIVE_INBOX_STATUSES = [
  "pending",
  "analyzed",
  "saved",
] satisfies readonly InboxStatus[];

export type InboxProcessorOptions = {
  beforeClaim?: (messageKey: string) => Promise<void>;
};

export type InboxClaimResult =
  | { kind: "none" }
  | { kind: "exhausted" }
  | { kind: "claimed"; item: InboxItem; leaseToken: string };

export async function claimNextInboxItem(
  db: Kysely<AppDatabase>,
  nowMs: number,
  options: InboxProcessorOptions = {},
): Promise<InboxClaimResult> {
  const target = await selectInboxHead(db, ACTIVE_INBOX_STATUSES);
  if (!target) {
    return { kind: "none" };
  }
  if (
    (target.lease_until !== null && target.lease_until >= nowMs) ||
    (target.next_attempt_at !== null && target.next_attempt_at > nowMs)
  ) {
    return { kind: "none" };
  }

  if (target.attempts >= MAX_ATTEMPTS) {
    const failed = await db
      .updateTable("inbox")
      .set({
        status: "failed",
        failed_at: nowMs,
        next_attempt_at: null,
        lease_token: null,
        lease_until: null,
      })
      .where("message_key", "=", target.message_key)
      .where("status", "in", ACTIVE_INBOX_STATUSES)
      .where("attempts", ">=", MAX_ATTEMPTS)
      .where((eb) =>
        eb.or([
          eb("lease_until", "is", null),
          eb("lease_until", "<", nowMs),
        ]),
      )
      .where((eb) =>
        eb.or([
          eb("next_attempt_at", "is", null),
          eb("next_attempt_at", "<=", nowMs),
        ]),
      )
      .executeTakeFirst();
    return failed.numUpdatedRows > 0n
      ? { kind: "exhausted" }
      : { kind: "none" };
  }

  await options.beforeClaim?.(target.message_key);

  const leaseToken = randomUUID();
  const claimed = await claimInboxItem(
    db,
    target.message_key,
    leaseToken,
    nowMs + LEASE_DURATION_MS,
    nowMs,
    MAX_ATTEMPTS,
    ACTIVE_INBOX_STATUSES,
  );
  if (!claimed) {
    return { kind: "none" };
  }

  const item = await selectClaimedInboxItem(db, target.message_key, leaseToken);
  if (!item) {
    return { kind: "none" };
  }

  return { kind: "claimed", item, leaseToken };
}

export async function markIgnored(
  deps: AppDeps,
  messageKey: string,
  leaseToken: string,
  analysis: MessageAnalysis,
): Promise<void> {
  const ignored = await deps.db
    .updateTable("inbox")
    .set({
      status: "ignored",
      parsed_json: serializeMessageAnalysis(analysis),
      lease_token: null,
      lease_until: null,
      next_attempt_at: null,
      last_error: null,
    })
    .where("message_key", "=", messageKey)
    .where("status", "in", ["pending", "analyzed"])
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (ignored.numUpdatedRows === 0n) {
    throw new Error("Inbox lease was lost while ignoring message");
  }
}

export async function saveUserFailure(
  deps: AppDeps,
  messageKey: string,
  leaseToken: string,
  status: InboxStatus,
  responseText: string,
): Promise<string> {
  const saved = await deps.db
    .updateTable("inbox")
    .set({
      status: "saved",
      response_text: responseText,
      last_error: null,
      next_attempt_at: null,
    })
    .where("message_key", "=", messageKey)
    .where("status", "=", status)
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (saved.numUpdatedRows === 0n) {
    throw new Error("Inbox lease was lost while saving user feedback");
  }

  return responseText;
}

export async function scheduleRetry(
  deps: AppDeps,
  item: Pick<InboxItem, "message_key" | "attempts">,
  processingStatus: InboxStatus,
  leaseToken: string,
  error: unknown,
): Promise<void> {
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const attempts = item.attempts + 1;
  const terminal = attempts >= MAX_ATTEMPTS;
  const backoffMs = Math.pow(2, attempts) * RETRY_BASE_DELAY_MS;
  const errorMessage =
    error instanceof Error ? error.message : "Inbox processing failed";

  const updated = await deps.db
    .updateTable("inbox")
    .set({
      status: terminal ? "failed" : processingStatus,
      attempts,
      next_attempt_at: terminal ? null : nowMs + backoffMs,
      lease_token: null,
      lease_until: null,
      last_error: errorMessage,
      failed_at: terminal ? nowMs : null,
    })
    .where("message_key", "=", item.message_key)
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (updated.numUpdatedRows === 0n) {
    logger.warn(
      { messageKey: item.message_key },
      "Could not schedule inbox retry because the lease was lost",
    );
    return;
  }

  if (terminal) {
    logger.error(
      { messageKey: item.message_key, attempts, error: errorMessage },
      "Inbox item moved to failed state",
    );
    return;
  }

  logger.info(
    {
      messageKey: item.message_key,
      attempts,
      nextAttemptAt: new Date(nowMs + backoffMs).toISOString(),
      backoffMs,
    },
    "Scheduling retry for inbox item",
  );
}
