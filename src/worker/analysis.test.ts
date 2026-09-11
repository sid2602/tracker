import { describe, expect, it } from "vitest";
import {
  messageAnalysisSchema,
  parseMessageAnalysis,
  serializeMessageAnalysis,
  type MessageAnalysis,
} from "./analysis.js";

describe("message analysis persistence", () => {
  it("round-trips a parsed expense command", () => {
    const analysis: MessageAnalysis = {
      version: 1,
      intent: "expense",
      parsed: {
        items: [
          {
            amountCents: 1250,
            currency: "PLN",
            category: "food",
            occurredOn: "2026-09-11",
            note: "kawa",
          },
        ],
      },
    };

    expect(parseMessageAnalysis(serializeMessageAnalysis(analysis))).toEqual(analysis);
  });

  it("round-trips an ignored command", () => {
    const analysis: MessageAnalysis = {
      version: 1,
      intent: "ignore",
    };

    expect(parseMessageAnalysis(serializeMessageAnalysis(analysis))).toEqual(analysis);
  });

  it("rejects an invalid persisted command", () => {
    expect(() =>
      messageAnalysisSchema.parse({
        version: 2,
        intent: "expense",
        parsed: { items: [] },
      }),
    ).toThrow();
  });
});
