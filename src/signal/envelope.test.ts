import { describe, expect, it } from "vitest";
import { parseEnvelope } from "./envelope.js";

const SOURCE_AUTHOR = "+15005550100";
const SOURCE_TIMESTAMP = 1_700_000_000_000;

describe("parseEnvelope", () => {
  it("reads a native dataMessage envelope", () => {
    expect(
      parseEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          timestamp: SOURCE_TIMESTAMP,
          dataMessage: {
            message: "groceries 15 pln",
          },
        },
      }),
    ).toEqual({
      messageKey: "+15005550100-0-1700000000000", sourceAuthor: SOURCE_AUTHOR,
      sourceTimestamp: SOURCE_TIMESTAMP,
      rawText: "groceries 15 pln",
    });
  });

  it("prefers sourceNumber over source", () => {
    expect(
      parseEnvelope({
        envelope: {
          source: "uuid-or-name",
          sourceNumber: SOURCE_AUTHOR,
          timestamp: SOURCE_TIMESTAMP,
          dataMessage: {
            message: "fuel 40 pln",
          },
        },
      }),
    ).toEqual({
      messageKey: "+15005550100-0-1700000000000", sourceAuthor: SOURCE_AUTHOR,
      sourceTimestamp: SOURCE_TIMESTAMP,
      rawText: "fuel 40 pln",
    });
  });

  it("reads a json-rpc params envelope", () => {
    expect(
      parseEnvelope({
        jsonrpc: "2.0",
        method: "receive",
        params: {
          envelope: {
            source: SOURCE_AUTHOR,
            timestamp: SOURCE_TIMESTAMP,
            dataMessage: {
              message: "report this month",
            },
          },
        },
      }),
    ).toEqual({
      messageKey: "+15005550100-0-1700000000000", sourceAuthor: SOURCE_AUTHOR,
      sourceTimestamp: SOURCE_TIMESTAMP,
      rawText: "report this month",
    });
  });

  it("reads a sync sentMessage echo", () => {
    expect(
      parseEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          timestamp: SOURCE_TIMESTAMP,
          syncMessage: {
            sentMessage: {
              message: "Saved 1 item",
            },
          },
        },
      }),
    ).toEqual({
      messageKey: "+15005550100-0-1700000000000", sourceAuthor: SOURCE_AUTHOR,
      sourceTimestamp: SOURCE_TIMESTAMP,
      rawText: "Saved 1 item",
    });
  });

  it("ignores typing and receipt events", () => {
    expect(
      parseEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          timestamp: SOURCE_TIMESTAMP,
          typingMessage: { action: "STARTED" },
        },
      }),
    ).toBeNull();

    expect(
      parseEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          timestamp: SOURCE_TIMESTAMP,
          receiptMessage: { type: "DELIVERY" },
        },
      }),
    ).toBeNull();
  });

  it("ignores empty text", () => {
    expect(
      parseEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          timestamp: SOURCE_TIMESTAMP,
          dataMessage: { message: "   " },
        },
      }),
    ).toBeNull();
  });
});
