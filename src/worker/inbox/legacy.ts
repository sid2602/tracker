import { logger } from "../../lib/logger.js";
import { classifyEnvelope } from "../../signal/index.js";
import { serializeMessageAnalysis } from "../analysis.js";
import type { AppDeps, MessageContext } from "../types.js";
import type { InboxItem } from "./storage.js";

const SELF_ECHO_IGNORED_REASON = "self_echo_ignored";
const SELF_ECHO_REVIEW_REASON = "self_echo_requires_manual_review";
const UNAUTHORIZED_IGNORED_REASON = "unauthorized_author_ignored";
const UNAUTHORIZED_REVIEW_REASON = "unauthorized_requires_manual_review";

type HistoricalInboxItem = Pick<InboxItem, "message_key" | "status">;

export type StoredMessage =
  | { kind: "inbound"; context: MessageContext }
  | { kind: "self_echo" }
  | { kind: "unauthorized" }
  | { kind: "quarantine" }
  | { kind: "invalid" };

export async function handleHistoricalSelfEcho(
  deps: AppDeps,
  item: HistoricalInboxItem,
  leaseToken: string,
): Promise<void> {
  if (item.status === "saved") {
    const quarantined = await deps.db
      .updateTable("inbox")
      .set({
        status: "failed",
        last_error: SELF_ECHO_REVIEW_REASON,
        failed_at: (deps.now?.() ?? new Date()).getTime(),
        next_attempt_at: null,
        lease_token: null,
        lease_until: null,
      })
      .where("message_key", "=", item.message_key)
      .where("status", "=", "saved")
      .where("lease_token", "=", leaseToken)
      .executeTakeFirst();

    if (quarantined.numUpdatedRows === 0n) {
      throw new Error("Inbox lease was lost while quarantining self-echo");
    }

    logger.warn(
      { messageKey: item.message_key },
      "Historical saved self-echo quarantined for manual review",
    );
    return;
  }

  if (item.status !== "pending" && item.status !== "analyzed") {
    throw new Error(`Cannot clean up self-echo in ${item.status} state`);
  }

  const ignored = await deps.db
    .updateTable("inbox")
    .set({
      status: "ignored",
      parsed_json: serializeMessageAnalysis({
        version: 1,
        intent: "ignore",
      }),
      response_text: null,
      last_error: SELF_ECHO_IGNORED_REASON,
      failed_at: null,
      next_attempt_at: null,
      lease_token: null,
      lease_until: null,
    })
    .where("message_key", "=", item.message_key)
    .where("status", "in", ["pending", "analyzed"])
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (ignored.numUpdatedRows === 0n) {
    throw new Error("Inbox lease was lost while ignoring self-echo");
  }
}

export async function handleHistoricalUnauthorized(
  deps: AppDeps,
  item: HistoricalInboxItem,
  leaseToken: string,
): Promise<void> {
  if (item.status === "saved") {
    const quarantined = await deps.db
      .updateTable("inbox")
      .set({
        status: "failed",
        last_error: UNAUTHORIZED_REVIEW_REASON,
        failed_at: (deps.now?.() ?? new Date()).getTime(),
        next_attempt_at: null,
        lease_token: null,
        lease_until: null,
      })
      .where("message_key", "=", item.message_key)
      .where("status", "=", "saved")
      .where("lease_token", "=", leaseToken)
      .executeTakeFirst();

    if (quarantined.numUpdatedRows === 0n) {
      throw new Error(
        "Inbox lease was lost while quarantining unauthorized message",
      );
    }

    logger.warn(
      { messageKey: item.message_key },
      "Historical saved unauthorized message quarantined for manual review",
    );
    return;
  }

  if (item.status !== "pending" && item.status !== "analyzed") {
    throw new Error(`Cannot clean up unauthorized message in ${item.status} state`);
  }

  const ignored = await deps.db
    .updateTable("inbox")
    .set({
      status: "ignored",
      parsed_json: serializeMessageAnalysis({
        version: 1,
        intent: "ignore",
      }),
      response_text: null,
      last_error: UNAUTHORIZED_IGNORED_REASON,
      failed_at: null,
      next_attempt_at: null,
      lease_token: null,
      lease_until: null,
    })
    .where("message_key", "=", item.message_key)
    .where("status", "in", ["pending", "analyzed"])
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (ignored.numUpdatedRows === 0n) {
    throw new Error("Inbox lease was lost while ignoring unauthorized message");
  }

  logger.warn(
    { messageKey: item.message_key },
    "Historical unauthorized message ignored",
  );
}

export async function quarantineHistoricalMessage(
  deps: AppDeps,
  item: HistoricalInboxItem,
  leaseToken: string,
): Promise<void> {
  const quarantined = await deps.db
    .updateTable("inbox")
    .set({
      status: "failed",
      last_error: "legacy_self_account_device_unknown",
      failed_at: (deps.now?.() ?? new Date()).getTime(),
      next_attempt_at: null,
      lease_token: null,
      lease_until: null,
    })
    .where("message_key", "=", item.message_key)
    .where("status", "=", item.status)
    .where("lease_token", "=", leaseToken)
    .executeTakeFirst();

  if (quarantined.numUpdatedRows === 0n) {
    throw new Error("Inbox lease was lost while quarantining legacy message");
  }

  logger.warn(
    { messageKey: item.message_key },
    "Legacy self-account message quarantined for manual review",
  );
}

export function deserializeStoredMessage(
  rawEnvelope: string,
  envelopeOptions: {
    selfNumber?: string;
    allowedInputDeviceIds?: readonly number[];
  },
): StoredMessage {
  try {
    const parsed: unknown = JSON.parse(rawEnvelope);
    const classification = classifyEnvelope(parsed, envelopeOptions);
    if (classification.kind === "self_echo") {
      return { kind: "self_echo" };
    }
    if (classification.kind === "unauthorized") {
      return { kind: "unauthorized" };
    }
    if (classification.kind === "inbound") {
      return { kind: "inbound", context: classification.context };
    }

    const legacyContext = parseLegacyMessageContext(parsed);
    if (!legacyContext) {
      return { kind: "invalid" };
    }

    if (
      envelopeOptions.selfNumber === undefined ||
      legacyContext.sourceAuthor !== envelopeOptions.selfNumber
    ) {
      return { kind: "unauthorized" };
    }

    const legacySourceDevice = parseLegacySourceDevice(legacyContext);
    if (legacySourceDevice === null) {
      return { kind: "quarantine" };
    }
    if (
      envelopeOptions.allowedInputDeviceIds === undefined ||
      !envelopeOptions.allowedInputDeviceIds.includes(legacySourceDevice)
    ) {
      return { kind: "self_echo" };
    }

    return { kind: "inbound", context: legacyContext };
  } catch {
    return { kind: "invalid" };
  }
}

function parseLegacySourceDevice(context: MessageContext): number | null {
  const prefix = `${context.sourceAuthor}-`;
  const suffix = `-${context.sourceTimestamp}`;
  if (
    !context.messageKey.startsWith(prefix) ||
    !context.messageKey.endsWith(suffix)
  ) {
    return null;
  }

  const serializedDevice = context.messageKey.slice(
    prefix.length,
    context.messageKey.length - suffix.length,
  );
  if (!/^\d+$/u.test(serializedDevice)) {
    return null;
  }

  const deviceId = Number(serializedDevice);
  return Number.isSafeInteger(deviceId) && deviceId > 0 ? deviceId : null;
}

function parseLegacyMessageContext(value: unknown): MessageContext | null {
  if (!isRecord(value)) {
    return null;
  }

  const sourceAuthor = value.sourceAuthor;
  const sourceTimestamp = value.sourceTimestamp;
  const rawText = value.rawText;
  const messageKey = value.messageKey;

  if (
    typeof sourceAuthor !== "string" ||
    typeof sourceTimestamp !== "number" ||
    typeof rawText !== "string" ||
    typeof messageKey !== "string"
  ) {
    return null;
  }

  return { sourceAuthor, sourceTimestamp, rawText, messageKey };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
