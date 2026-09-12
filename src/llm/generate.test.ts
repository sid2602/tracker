import { beforeEach, describe, expect, it, vi } from "vitest";
import { NoObjectGeneratedError, TypeValidationError } from "ai";
import { z } from "zod";
import { createTestConfig } from "../test/fixtures.js";
import { generateStructured, withAbortTimeout } from "./generate.js";

const generateObjectMock = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    generateObject: (...args: unknown[]) => generateObjectMock(...args),
  };
});

vi.mock("./provider.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

const config = createTestConfig();

describe("generateStructured", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("classifies a stopped schema validation as user input", async () => {
    const cause = new TypeValidationError({
      value: {},
      cause: new Error("invalid object"),
    });
    const error = new NoObjectGeneratedError({
      cause,
      response: {
        id: "test-response",
        timestamp: new Date(),
        modelId: "test-model",
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      finishReason: "stop",
    });
    generateObjectMock.mockRejectedValue(error);

    await expect(
      generateStructured(config, z.object({ value: z.string() }), "prompt", "llm.expense"),
    ).rejects.toMatchObject({
      name: "UserInputError",
      userMessage: "Could not understand that request. Please provide more details.",
    });
  });

  it("keeps truncated schema output retryable", async () => {
    const cause = new TypeValidationError({
      value: {},
      cause: new Error("invalid object"),
    });
    const error = new NoObjectGeneratedError({
      cause,
      response: {
        id: "test-response",
        timestamp: new Date(),
        modelId: "test-model",
      },
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
      },
      finishReason: "length",
    });
    generateObjectMock.mockRejectedValue(error);

    await expect(
      generateStructured(config, z.object({ value: z.string() }), "prompt", "llm.expense"),
    ).rejects.toMatchObject({
      name: "AI_NoObjectGeneratedError",
      finishReason: "length",
    });
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("keeps transport failures retryable", async () => {
    generateObjectMock.mockRejectedValue(new Error("gateway unavailable"));

    await expect(
      generateStructured(config, z.object({ value: z.string() }), "prompt", "llm.expense"),
    ).rejects.toThrow("gateway unavailable");
    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("aborts a hanging operation at its deadline", async () => {
    await expect(
      withAbortTimeout(
        (signal) =>
          new Promise<never>((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
        5,
      ),
    ).rejects.toThrow("aborted");
  });
});
