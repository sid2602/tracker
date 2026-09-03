import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config.js";
import { UNRECOGNIZED_MESSAGE } from "../lib/messages.js";
import { processMessage } from "./dispatch.js";
import type { AppDeps } from "./types.js";

const routeMessageMock = vi.fn();
const handleExpenseMock = vi.fn();

vi.mock("../routing/router.js", () => ({
  routeMessage: (...args: unknown[]) => routeMessageMock(...args),
}));

vi.mock("../domains/expenses/index.js", () => ({
  handleExpense: (...args: unknown[]) => handleExpenseMock(...args),
}));

vi.mock("../domains/reports/index.js", () => ({
  handleReport: vi.fn(),
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

const deps = { db: {}, config } as AppDeps;
const context = {
  sourceAuthor: "+15005550100",
  sourceTimestamp: 1,
  rawText: "groceries 15 pln",
};

describe("processMessage", () => {
  beforeEach(() => {
    routeMessageMock.mockReset();
    handleExpenseMock.mockReset();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns silent for ignore", async () => {
    routeMessageMock.mockResolvedValue({ intent: "ignore" });

    await expect(processMessage(deps, context)).resolves.toEqual({
      kind: "silent",
    });
    expect(handleExpenseMock).not.toHaveBeenCalled();
  });

  it("maps handler failure to unrecognized", async () => {
    routeMessageMock.mockResolvedValue({ intent: "expense" });
    handleExpenseMock.mockResolvedValue({
      kind: "failure",
      message: "invalid response",
    });

    await expect(processMessage(deps, context)).resolves.toEqual({
      kind: "failure",
      message: UNRECOGNIZED_MESSAGE,
      errorCode: "unrecognized",
    });
  });

  it("maps router exceptions to unrecognized", async () => {
    routeMessageMock.mockRejectedValue(new Error("schema mismatch"));

    await expect(processMessage(deps, context)).resolves.toEqual({
      kind: "failure",
      message: UNRECOGNIZED_MESSAGE,
      errorCode: "processing_failed",
    });
  });
});
