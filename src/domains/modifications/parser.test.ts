import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config.js";
import { parseModification } from "./parser.js";

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
  signalAllowedInputDeviceIds: [1],
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: "https://cloud.langfuse.com",
};
const REFERENCE_DATE = "2026-09-11";

describe("parseModification", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("retries after first failure", async () => {
    generateObjectMock
      .mockRejectedValueOnce(new Error("invalid response"))
      .mockResolvedValueOnce({
        object: {
          action: "delete",
          target: "last",
        },
      });

    await expect(
      parseModification(config, "cofnij", REFERENCE_DATE),
    ).resolves.toEqual({
      action: "delete",
      target: "last",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two failed attempts", async () => {
    generateObjectMock.mockRejectedValue(new Error("invalid response"));

    await expect(
      parseModification(config, "cofnij", REFERENCE_DATE),
    ).rejects.toThrow("invalid response");

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("converts semantically incomplete model output into user feedback", async () => {
    generateObjectMock.mockResolvedValue({
      object: {
        action: "delete",
        target: "specific",
        searchCriteria: null,
      },
    });

    await expect(
      parseModification(config, "delete this", REFERENCE_DATE),
    ).rejects.toThrow(
      "Please identify one expense by ID or provide unambiguous details.",
    );
  });
});
