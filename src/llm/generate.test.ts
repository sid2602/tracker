import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Config } from "../config.js";
import { generateStructured } from "./generate.js";

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock("./provider.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

const config: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: ":memory:",
  signalRpcHost: "signal-cli-rest-api",
  signalRpcPort: 6001,
  signalPhoneNumber: "+15005550100",
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: "https://cloud.langfuse.com",
};

describe("generateStructured", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("classifies a stopped schema validation as user input", async () => {
    const error = new Error("schema validation failed");
    error.name = "AI_NoObjectGeneratedError";
    error.cause = Object.assign(new Error("invalid object"), {
      name: "AI_TypeValidationError",
    });
    Object.assign(error, { finishReason: "stop" });
    generateObjectMock.mockRejectedValue(error);

    await expect(
      generateStructured(config, z.object({ value: z.string() }), "prompt", "llm.expense"),
    ).rejects.toMatchObject({
      name: "UserInputError",
      userMessage: "Could not understand that request. Please provide more details.",
    });
  });

  it("keeps transport failures retryable", async () => {
    generateObjectMock.mockRejectedValue(new Error("gateway unavailable"));

    await expect(
      generateStructured(config, z.object({ value: z.string() }), "prompt", "llm.expense"),
    ).rejects.toThrow("gateway unavailable");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
