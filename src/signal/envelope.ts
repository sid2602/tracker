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

function extractAuthor(envelope: Record<string, unknown>): string | null {
  return readString(envelope, "sourceNumber") ?? readString(envelope, "source");
}

function extractTimestamp(envelope: Record<string, unknown>): number | null {
  const timestamp = envelope.timestamp;
  return typeof timestamp === "number" && Number.isFinite(timestamp)
    ? timestamp
    : null;
}

function extractSourceDevice(envelope: Record<string, unknown>): number | null {
  const sourceDevice = envelope.sourceDevice;
  return typeof sourceDevice === "number" && Number.isInteger(sourceDevice)
    ? sourceDevice
    : null;
}

export type EnvelopeClassification =
  | { kind: "inbound"; context: MessageContext }
  | { kind: "self_echo" }
  | { kind: "unauthorized" }
  | { kind: "irrelevant" };

export type EnvelopeOptions = {
  selfNumber?: string;
  allowedInputDeviceIds?: readonly number[];
};

function parseDataMessage(envelope: Record<string, unknown>): MessageContext | null {
  const dataMessage = envelope.dataMessage;
  if (!isRecord(dataMessage)) {
    return null;
  }

  const rawText = readString(dataMessage, "message");
  const sourceAuthor = extractAuthor(envelope);
  const sourceTimestamp = extractTimestamp(envelope);
  const sourceDevice = typeof envelope.sourceDevice === "number" ? envelope.sourceDevice : 0;

  if (!rawText || !sourceAuthor || sourceTimestamp === null) {
    return null;
  }

  return {
    sourceAuthor,
    sourceTimestamp,
    rawText,
    messageKey: `${sourceAuthor}-${sourceDevice}-${sourceTimestamp}`,
  };
}

function hasSentMessage(envelope: Record<string, unknown>): boolean {
  return isRecord(envelope.syncMessage) && isRecord(envelope.syncMessage.sentMessage);
}

function parseSelfChatMessage(
  envelope: Record<string, unknown>,
  options: EnvelopeOptions,
): MessageContext | null {
  if (
    !options.selfNumber ||
    options.allowedInputDeviceIds === undefined ||
    !isRecord(envelope.syncMessage) ||
    !isRecord(envelope.syncMessage.sentMessage)
  ) {
    return null;
  }

  const sentMessage = envelope.syncMessage.sentMessage;
  const destination =
    readString(sentMessage, "destinationNumber") ?? readString(sentMessage, "destination");
  const sourceAuthor = extractAuthor(envelope);
  const rawText = readString(sentMessage, "message");
  const sourceDevice = extractSourceDevice(envelope);
  const sourceTimestamp =
    typeof sentMessage.timestamp === "number" && Number.isFinite(sentMessage.timestamp)
      ? sentMessage.timestamp
      : extractTimestamp(envelope);

  if (
    destination !== options.selfNumber ||
    sourceAuthor !== options.selfNumber ||
    !rawText ||
    sourceDevice === null ||
    !options.allowedInputDeviceIds.includes(sourceDevice) ||
    sourceTimestamp === null
  ) {
    return null;
  }

  return {
    sourceAuthor,
    sourceTimestamp,
    rawText,
    messageKey: `${destination}-${sourceDevice}-${sourceTimestamp}`,
  };
}

function isBotDataMessage(
  envelope: Record<string, unknown>,
  context: MessageContext,
  options: EnvelopeOptions,
): boolean {
  if (options.selfNumber === undefined || context.sourceAuthor !== options.selfNumber) {
    return false;
  }

  const sourceDevice = extractSourceDevice(envelope);
  if (
    options.allowedInputDeviceIds === undefined ||
    sourceDevice === null
  ) {
    return true;
  }

  return !options.allowedInputDeviceIds.includes(sourceDevice);
}

export function classifyEnvelope(
  payload: unknown,
  options: EnvelopeOptions = {},
): EnvelopeClassification {
  const envelope = getEnvelope(payload);
  if (!envelope) {
    return { kind: "irrelevant" };
  }

  const hasDataMessage = "dataMessage" in envelope;
  const context = parseDataMessage(envelope);
  if (hasDataMessage) {
    if (!context) {
      return { kind: "irrelevant" };
    }

    if (
      options.selfNumber === undefined ||
      context.sourceAuthor !== options.selfNumber
    ) {
      return { kind: "unauthorized" };
    }

    return isBotDataMessage(envelope, context, options)
      ? { kind: "self_echo" }
      : { kind: "inbound", context };
  }

  const selfChatMessage = parseSelfChatMessage(envelope, options);
  if (selfChatMessage) {
    return { kind: "inbound", context: selfChatMessage };
  }

  if (hasSentMessage(envelope)) {
    return { kind: "self_echo" };
  }

  return { kind: "irrelevant" };
}

export function parseEnvelope(
  payload: unknown,
  options: EnvelopeOptions = {},
): MessageContext | null {
  const classification = classifyEnvelope(payload, options);
  return classification.kind === "inbound" ? classification.context : null;
}
