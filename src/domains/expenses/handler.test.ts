import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config.js";
import { initSchema, openDatabase } from "../../db/connection.js";
import type { AppDeps } from "../../worker/types.js";
import { handleExpense } from "./handler.js";
import {
  countExpenses,
  getExpenseByKey,
} from "./repository.js";
import type { ExpenseResult } from "./schema.js";

const TEST_SOURCE_AUTHOR = "+48000000000";

const config: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: "./data/expenses.db",
};

const parseExpensesMock = vi.fn<
  (config: Config, text: string, referenceDate: string) => Promise<ExpenseResult>
>();

vi.mock("./parser.js", () => ({
  parseExpenses: (
    configArg: Config,
    text: string,
    referenceDate: string,
  ) => parseExpensesMock(configArg, text, referenceDate),
}));

function createParsedResult(
  items: ExpenseResult["items"],
): ExpenseResult {
  return { items };
}

describe("handleExpense", () => {
  let tempDir: string;
  let dbPath: string;
  let deps: AppDeps;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-expense-test-"));
    dbPath = join(tempDir, "expenses.db");
    const db = openDatabase(dbPath);
    initSchema(db);
    deps = { db, config };
    parseExpensesMock.mockReset();
  });

  afterEach(() => {
    deps.db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("saves a single expense", async () => {
    parseExpensesMock.mockResolvedValue(
      createParsedResult([
        {
          amountCents: 1500,
          currency: "PLN",
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "zakupy",
        },
      ]),
    );

    const result = await handleExpense(deps, {
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 1_700_000_000_000,
      rawText: "zakupy 15 zl",
    });

    expect(result).toEqual({
      kind: "success",
      message: "✅ Zapisano 1 pozycje",
    });
    expect(countExpenses(deps.db)).toBe(1);

    const stored = getExpenseByKey(
      deps.db,
      TEST_SOURCE_AUTHOR,
      1_700_000_000_000,
      0,
    );

    expect(stored?.amount_cents).toBe(1500);
  });

  it("saves multiple items from one message", async () => {
    parseExpensesMock.mockResolvedValue(
      createParsedResult([
        {
          amountCents: 1000,
          currency: "PLN",
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "chleb",
        },
        {
          amountCents: 500,
          currency: "PLN",
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "mleko",
        },
      ]),
    );

    const result = await handleExpense(deps, {
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 1_700_000_000_001,
      rawText: "chleb 10 zl, mleko 5 zl",
    });

    expect(result).toEqual({
      kind: "success",
      message: "✅ Zapisano 2 pozycji",
    });
    expect(countExpenses(deps.db)).toBe(2);
  });

  it("does not save when LLM parsing fails", async () => {
    parseExpensesMock.mockRejectedValue(new Error("invalid response"));

    const result = await handleExpense(deps, {
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 1_700_000_000_002,
      rawText: "cos niejasnego",
    });

    expect(result).toEqual({
      kind: "failure",
      message: "invalid response",
    });
    expect(countExpenses(deps.db)).toBe(0);
  });

  it("ignores duplicate message on second insert", async () => {
    const context = {
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 1_700_000_000_003,
      rawText: "zakupy 15 zl",
    };

    parseExpensesMock.mockResolvedValue(
      createParsedResult([
        {
          amountCents: 1500,
          currency: "PLN",
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "zakupy",
        },
      ]),
    );

    const first = await handleExpense(deps, context);
    const second = await handleExpense(deps, context);

    expect(first).toEqual({
      kind: "success",
      message: "✅ Zapisano 1 pozycje",
    });
    expect(second).toEqual({
      kind: "success",
      message: "✅ Wiadomosc juz byla zapisana",
    });
    expect(countExpenses(deps.db)).toBe(1);
  });
});
