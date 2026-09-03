import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config.js";
import { parseExpenses } from "./parser.js";

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock("../../llm/provider.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

const config: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: "./data/expenses.db",
  signalApiUrl: "http://127.0.0.1:8080",
  signalPhoneNumber: "+15005550100",
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: "https://cloud.langfuse.com",
};

describe("parseExpenses", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("retries after first failure", async () => {
    generateObjectMock
      .mockRejectedValueOnce(new Error("invalid response"))
      .mockResolvedValueOnce({
        object: {
          items: [
            {
              amountCents: 1500,
              currency: "PLN",
              category: "groceries",
              occurredOn: "2026-09-01",
              note: "zakupy",
            },
          ],
        },
      });

    await expect(
      parseExpenses(config, "zakupy 15 zl", "2026-09-01"),
    ).resolves.toEqual({
      items: [
        {
          amountCents: 1500,
          currency: "PLN",
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "zakupy",
        },
      ],
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two failed attempts", async () => {
    generateObjectMock.mockRejectedValue(new Error("invalid response"));

    await expect(
      parseExpenses(config, "zakupy 15 zl", "2026-09-01"),
    ).rejects.toThrow("invalid response");

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
