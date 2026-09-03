import type { MessageContext } from "../worker/types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getEnvelope(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (isRecord(payload.params) && isRecord(payload.params.envelope)) {
    return payload.params.envelope;
  }

  if (isRecord(payload.envelope)) {
    return payload.envelope;
  }

  if ("dataMessage" in payload || "syncMessage" in payload) {
    return payload;
  }

  return null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function extractText(envelope: Record<string, unknown>): string | null {
  if (isRecord(envelope.dataMessage)) {
    const text = readString(envelope.dataMessage, "message");
    if (text) {
      return text;
    }
  }

  if (isRecord(envelope.syncMessage) && isRecord(envelope.syncMessage.sentMessage)) {
    return readString(envelope.syncMessage.sentMessage, "message");
  }

  return null;
}

function extractAuthor(envelope: Record<string, unknown>): string | null {
  return readString(envelope, "sourceNumber") ?? readString(envelope, "source");
}

function extractTimestamp(envelope: Record<string, unknown>): number | null {
  const timestamp = envelope.timestamp;
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : null;
}

export function parseEnvelope(payload: unknown): MessageContext | null {
  const envelope = getEnvelope(payload);
  if (!envelope) {
    return null;
  }

  const rawText = extractText(envelope);
  const sourceAuthor = extractAuthor(envelope);
  const sourceTimestamp = extractTimestamp(envelope);
  const sourceDevice = typeof envelope.sourceDevice === "number" ? envelope.sourceDevice : 0;

  if (!rawText || !sourceAuthor || sourceTimestamp === null) {
    return null;
  }

  const messageKey = `${sourceAuthor}-${sourceDevice}-${sourceTimestamp}`;

  return {
    sourceAuthor,
    sourceTimestamp,
    rawText,
    messageKey,
  };
}
