import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config.js";
import { parseCategoryAction } from "./parser.js";

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
  signalRpcHost: "signal-cli-rest-api",
  signalRpcPort: 6001,
  signalPhoneNumber: "+15005550100",
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: "https://cloud.langfuse.com",
};

describe("parseCategoryAction", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("retries after first failure", async () => {
    generateObjectMock
      .mockRejectedValueOnce(new Error("invalid response"))
      .mockResolvedValueOnce({
        object: { action: "add", categoryName: "pets" },
      });

    await expect(
      parseCategoryAction(config, "add pets category"),
    ).resolves.toEqual({
      action: "add",
      categoryName: "pets",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two failed attempts", async () => {
    generateObjectMock.mockRejectedValue(new Error("invalid response"));

    await expect(
      parseCategoryAction(config, "add something"),
    ).rejects.toThrow("invalid response");

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
