import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config.js";
import { dispatchMessage } from "./dispatch.js";
import type { AppDeps } from "./types.js";

const handleExpenseMock = vi.fn();
const handleReportMock = vi.fn();

vi.mock("../domains/expenses/index.js", () => ({
  handleExpense: (...args: unknown[]) => handleExpenseMock(...args),
}));

vi.mock("../domains/reports/index.js", () => ({
  handleReport: (...args: unknown[]) => handleReportMock(...args),
}));

const config: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: "./data/expenses.db",
  signalApiUrl: "http://127.0.0.1:8080",
  signalPhoneNumber: "+15005550100",
};

const deps = { db: {}, config } as AppDeps;
const context = {
  sourceAuthor: "+48000000000",
  sourceTimestamp: 1,
  rawText: "test",
};

describe("dispatchMessage", () => {
  beforeEach(() => {
    handleExpenseMock.mockReset();
    handleReportMock.mockReset();
  });

  it("delegates expense intent to expenses domain", async () => {
    handleExpenseMock.mockResolvedValue({
      kind: "success",
      message: "Saved 1 item",
    });

    const result = await dispatchMessage(deps, context, { intent: "expense" });

    expect(handleExpenseMock).toHaveBeenCalledWith(deps, context);
    expect(result).toEqual({
      kind: "success",
      message: "Saved 1 item",
    });
  });

  it("delegates report intent to reports domain", async () => {
    handleReportMock.mockResolvedValue({
      kind: "success",
      message: "📊 Report: this month\n\nno expenses",
    });

    const route = {
      intent: "report" as const,
      period: "this_month" as const,
      group_by: "total" as const,
    };

    const result = await dispatchMessage(deps, context, route);

    expect(handleReportMock).toHaveBeenCalledWith(deps, route);
    expect(result).toEqual({
      kind: "success",
      message: "📊 Report: this month\n\nno expenses",
    });
  });

  it("returns silent for ignore intent", async () => {
    const result = await dispatchMessage(deps, context, { intent: "ignore" });

    expect(result).toEqual({ kind: "silent" });
    expect(handleExpenseMock).not.toHaveBeenCalled();
    expect(handleReportMock).not.toHaveBeenCalled();
  });
});
