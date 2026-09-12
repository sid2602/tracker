import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { UNRECOGNIZED_MESSAGE } from "../lib/messages.js";
import { createTestDeps, openTestDatabase } from "../test/fixtures.js";
import { processMessage } from "./dispatch.js";

const routeMessageMock = vi.fn();
const handleExpenseMock = vi.fn();

vi.mock("../routing/router.js", () => ({
  routeMessage: (...args: unknown[]) => routeMessageMock(...args),
}));

vi.mock("../domains/expenses/index.js", () => ({
  handleExpense: (...args: unknown[]) => handleExpenseMock(...args),
  analyzeExpense: vi.fn(),
  persistExpense: vi.fn(),
}));

vi.mock("../domains/reports/index.js", () => ({
  handleReport: vi.fn(),
  analyzeReport: vi.fn(),
  persistReport: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const testDb = openTestDatabase();
const deps = createTestDeps(testDb);
const context = {
  messageKey: "test-key", sourceAuthor: "+15005550100",
  sourceTimestamp: 1,
  rawText: "groceries 15 pln",
};

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testDb.destroy();
});

describe("processMessage", () => {
  beforeEach(() => {
    routeMessageMock.mockReset();
    handleExpenseMock.mockReset();
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

  it("propagates router exceptions so the inbox can retry", async () => {
    routeMessageMock.mockRejectedValue(new Error("schema mismatch"));

    await expect(processMessage(deps, context)).rejects.toThrow("schema mismatch");
  });
});
