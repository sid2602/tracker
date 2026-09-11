import { describe, expect, it } from "vitest";
import { classifyEnvelope, parseEnvelope } from "./envelope.js";

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

  it("classifies a sync sentMessage echo without parsing it as inbound", () => {
    const payload = {
      envelope: {
        source: SOURCE_AUTHOR,
        timestamp: SOURCE_TIMESTAMP,
        syncMessage: {
          sentMessage: {
            message: "Saved 1 item",
          },
        },
      },
    };

    expect(classifyEnvelope(payload)).toEqual({ kind: "self_echo" });
    expect(parseEnvelope(payload)).toBeNull();
  });

  it("prioritizes a valid dataMessage over a sync sentMessage", () => {
    expect(
      classifyEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          timestamp: SOURCE_TIMESTAMP,
          dataMessage: {
            message: "groceries 15 pln",
          },
          syncMessage: {
            sentMessage: {
              message: "Saved 1 item",
            },
          },
        },
      }),
    ).toEqual({
      kind: "inbound",
      context: {
        messageKey: "+15005550100-0-1700000000000", sourceAuthor: SOURCE_AUTHOR,
        sourceTimestamp: SOURCE_TIMESTAMP,
        rawText: "groceries 15 pln",
      },
    });
  });

  it("accepts a self-chat message sent from a different device", () => {
    const payload = {
      envelope: {
        source: SOURCE_AUTHOR,
        sourceDevice: 1,
        timestamp: SOURCE_TIMESTAMP + 1,
        syncMessage: {
          sentMessage: {
            destinationNumber: SOURCE_AUTHOR,
            timestamp: SOURCE_TIMESTAMP + 1,
            message: "cocoa 10 pln",
          },
        },
      },
    };

    expect(
      classifyEnvelope(payload, {
        selfNumber: SOURCE_AUTHOR,
        allowedInputDeviceIds: [1],
      }),
    ).toEqual({
      kind: "inbound",
      context: {
        messageKey: "+15005550100-1-1700000000001",
        sourceAuthor: SOURCE_AUTHOR,
        sourceTimestamp: SOURCE_TIMESTAMP + 1,
        rawText: "cocoa 10 pln",
      },
    });
  });

  it("accepts self-chat messages from multiple allowlisted devices", () => {
    expect(
      classifyEnvelope(
        {
          envelope: {
            source: SOURCE_AUTHOR,
            sourceDevice: 3,
            timestamp: SOURCE_TIMESTAMP + 5,
            syncMessage: {
              sentMessage: {
                destinationNumber: SOURCE_AUTHOR,
                timestamp: SOURCE_TIMESTAMP + 5,
                message: "fuel 12 pln",
              },
            },
          },
        },
        {
          selfNumber: SOURCE_AUTHOR,
          allowedInputDeviceIds: [1, 3],
        },
      ),
    ).toEqual({
      kind: "inbound",
      context: {
        messageKey: "+15005550100-3-1700000000005",
        sourceAuthor: SOURCE_AUTHOR,
        sourceTimestamp: SOURCE_TIMESTAMP + 5,
        rawText: "fuel 12 pln",
      },
    });
  });

  it("ignores a self-chat message sent from the bot device", () => {
    const payload = {
      envelope: {
        source: SOURCE_AUTHOR,
        sourceDevice: 2,
        timestamp: SOURCE_TIMESTAMP + 1,
        syncMessage: {
          sentMessage: {
            destinationNumber: SOURCE_AUTHOR,
            timestamp: SOURCE_TIMESTAMP + 1,
            message: "Saved 1 item",
          },
        },
      },
    };

    expect(
      classifyEnvelope(payload, {
        selfNumber: SOURCE_AUTHOR,
        allowedInputDeviceIds: [1],
      }),
    ).toEqual({ kind: "self_echo" });
  });

  it("accepts a JSON-RPC self-chat message from another device", () => {
    expect(
      classifyEnvelope(
        {
          jsonrpc: "2.0",
          method: "receive",
          params: {
            envelope: {
              source: SOURCE_AUTHOR,
              sourceDevice: 1,
              timestamp: SOURCE_TIMESTAMP + 2,
              syncMessage: {
                sentMessage: {
                  destinationNumber: SOURCE_AUTHOR,
                  timestamp: SOURCE_TIMESTAMP + 2,
                  message: "fuel 10 pln",
                },
              },
            },
          },
        },
        {
          selfNumber: SOURCE_AUTHOR,
          allowedInputDeviceIds: [1],
        },
      ),
    ).toEqual({
      kind: "inbound",
      context: {
        messageKey: "+15005550100-1-1700000000002",
        sourceAuthor: SOURCE_AUTHOR,
        sourceTimestamp: SOURCE_TIMESTAMP + 2,
        rawText: "fuel 10 pln",
      },
    });
  });

  it("fails closed for a self-account dataMessage without source device", () => {
    expect(
      classifyEnvelope(
        {
          envelope: {
            source: SOURCE_AUTHOR,
            timestamp: SOURCE_TIMESTAMP + 3,
            dataMessage: {
              message: "Saved 1 item",
            },
          },
        },
        {
          selfNumber: SOURCE_AUTHOR,
          allowedInputDeviceIds: [1],
        },
      ),
    ).toEqual({ kind: "self_echo" });
  });

  it("does not accept self-chat from an unexpected source account", () => {
    expect(
      classifyEnvelope(
        {
          envelope: {
            source: "+48111111111",
            sourceDevice: 1,
            timestamp: SOURCE_TIMESTAMP + 4,
            syncMessage: {
              sentMessage: {
                destinationNumber: SOURCE_AUTHOR,
                timestamp: SOURCE_TIMESTAMP + 4,
                message: "foreign",
              },
            },
          },
        },
        {
          selfNumber: SOURCE_AUTHOR,
          allowedInputDeviceIds: [1],
        },
      ),
    ).toEqual({ kind: "self_echo" });
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
