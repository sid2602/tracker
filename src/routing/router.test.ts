import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config.js";
import { routeMessage } from "./router.js";

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock("../llm/provider.js", () => ({
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

describe("routeMessage", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("accepts valid response", async () => {
    generateObjectMock.mockResolvedValue({
      object: { intent: "expense" },
    });

    await expect(routeMessage(config, "zakupy 15 zl")).resolves.toEqual({
      intent: "expense",
    });
  });

  it("retries after first failure", async () => {
    generateObjectMock
      .mockRejectedValueOnce(new Error("invalid response"))
      .mockResolvedValueOnce({
        object: { intent: "ignore" },
      });

    await expect(routeMessage(config, "losowa notatka")).resolves.toEqual({
      intent: "ignore",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("normalizes report fields", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        intent: "report",
      },
    });

    await expect(routeMessage(config, "report this month")).resolves.toEqual({
      intent: "report",
    });
  });
});
