import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDeps, openTestDatabase } from "../test/fixtures.js";
import { dispatchMessage } from "./dispatch.js";

const handleExpenseMock = vi.fn();
const handleReportMock = vi.fn();

vi.mock("../domains/expenses/index.js", () => ({
  handleExpense: (...args: unknown[]) => handleExpenseMock(...args),
  analyzeExpense: vi.fn(),
  persistExpense: vi.fn(),
}));

vi.mock("../domains/reports/index.js", () => ({
  handleReport: (...args: unknown[]) => handleReportMock(...args),
  analyzeReport: vi.fn(),
  persistReport: vi.fn(),
}));

const testDb = openTestDatabase();
const deps = createTestDeps(testDb);
const context = {
  messageKey: "test-key", sourceAuthor: "+48000000000",
  sourceTimestamp: 1,
  rawText: "test",
};

afterAll(async () => {
  await testDb.destroy();
});

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
    };

    const result = await dispatchMessage(deps, context, route);

    expect(handleReportMock).toHaveBeenCalledWith(deps, context);
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
