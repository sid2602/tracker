import { describe, expect, it } from "vitest";
import { classifyEnvelope, parseEnvelope } from "./envelope.js";

const SOURCE_AUTHOR = "+15005550100";
const SOURCE_TIMESTAMP = 1_700_000_000_000;
const AUTHORIZED_OPTIONS = {
  selfNumber: SOURCE_AUTHOR,
  allowedInputDeviceIds: [1],
};

describe("parseEnvelope", () => {
  it("reads a native dataMessage envelope", () => {
    expect(
      parseEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          sourceDevice: 1,
          timestamp: SOURCE_TIMESTAMP,
          dataMessage: {
            message: "groceries 15 pln",
          },
        },
      }, AUTHORIZED_OPTIONS),
    ).toEqual({
      messageKey: "+15005550100-1-1700000000000", sourceAuthor: SOURCE_AUTHOR,
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
          sourceDevice: 1,
          timestamp: SOURCE_TIMESTAMP,
          dataMessage: {
            message: "fuel 40 pln",
          },
        },
      }, AUTHORIZED_OPTIONS),
    ).toEqual({
      messageKey: "+15005550100-1-1700000000000", sourceAuthor: SOURCE_AUTHOR,
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
            sourceDevice: 1,
            timestamp: SOURCE_TIMESTAMP,
            dataMessage: {
              message: "report this month",
            },
          },
        },
      }, AUTHORIZED_OPTIONS),
    ).toEqual({
      messageKey: "+15005550100-1-1700000000000", sourceAuthor: SOURCE_AUTHOR,
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
          sourceDevice: 1,
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
      }, AUTHORIZED_OPTIONS),
    ).toEqual({
      kind: "inbound",
      context: {
        messageKey: "+15005550100-1-1700000000000", sourceAuthor: SOURCE_AUTHOR,
        sourceTimestamp: SOURCE_TIMESTAMP,
        rawText: "groceries 15 pln",
      },
    });
  });

  it("rejects a regular dataMessage from another Signal account", () => {
    const payload = {
      envelope: {
        source: "+48111111111",
        sourceDevice: 1,
        timestamp: SOURCE_TIMESTAMP + 6,
        dataMessage: {
          message: "groceries 15 pln",
        },
      },
    };

    expect(classifyEnvelope(payload, AUTHORIZED_OPTIONS)).toEqual({
      kind: "unauthorized",
    });
    expect(parseEnvelope(payload, AUTHORIZED_OPTIONS)).toBeNull();
  });

  it("does not fall back to a self echo when an unauthorized dataMessage is present", () => {
    expect(
      classifyEnvelope(
        {
          envelope: {
            source: "+48111111111",
            sourceDevice: 1,
            timestamp: SOURCE_TIMESTAMP + 7,
            dataMessage: {
              message: "foreign command",
            },
            syncMessage: {
              sentMessage: {
                destinationNumber: SOURCE_AUTHOR,
                message: "Saved 1 item",
              },
            },
          },
        },
        AUTHORIZED_OPTIONS,
      ),
    ).toEqual({ kind: "unauthorized" });
  });

  it("does not fall back to a self-chat message when dataMessage is malformed", () => {
    expect(
      classifyEnvelope(
        {
          envelope: {
            source: SOURCE_AUTHOR,
            sourceDevice: 1,
            timestamp: SOURCE_TIMESTAMP + 8,
            dataMessage: {},
            syncMessage: {
              sentMessage: {
                destinationNumber: SOURCE_AUTHOR,
                message: "Saved 1 item",
              },
            },
          },
        },
        AUTHORIZED_OPTIONS,
      ),
    ).toEqual({ kind: "irrelevant" });
  });

  it("fails closed when a dataMessage is classified without the account identity", () => {
    expect(
      classifyEnvelope({
        envelope: {
          source: SOURCE_AUTHOR,
          sourceDevice: 1,
          timestamp: SOURCE_TIMESTAMP + 9,
          dataMessage: {
            message: "foreign command",
          },
        },
      }),
    ).toEqual({ kind: "unauthorized" });
  });

  it("accepts a regular self dataMessage from an allowlisted device", () => {
    expect(
      classifyEnvelope(
        {
          envelope: {
            source: SOURCE_AUTHOR,
            sourceDevice: 1,
            timestamp: SOURCE_TIMESTAMP + 10,
            dataMessage: {
              message: "self expense",
            },
          },
        },
        AUTHORIZED_OPTIONS,
      ),
    ).toEqual({
      kind: "inbound",
      context: {
        messageKey: "+15005550100-1-1700000000010",
        sourceAuthor: SOURCE_AUTHOR,
        sourceTimestamp: SOURCE_TIMESTAMP + 10,
        rawText: "self expense",
      },
    });
  });

  it("ignores a regular self dataMessage from an unallowlisted device", () => {
    expect(
      classifyEnvelope(
        {
          envelope: {
            source: SOURCE_AUTHOR,
            sourceDevice: 2,
            timestamp: SOURCE_TIMESTAMP + 11,
            dataMessage: {
              message: "bot or unknown device",
            },
          },
        },
        AUTHORIZED_OPTIONS,
      ),
    ).toEqual({ kind: "self_echo" });
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
