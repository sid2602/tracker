import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Config } from "../../config.js";
import { initSchema, openDatabase } from "../../db/connection.js";
import {
  insertExpenses,
  type ExpenseInput,
} from "../expenses/repository.js";
import type { AppDeps } from "../../worker/types.js";
import { handleReport } from "./handler.js";

const TEST_SOURCE_AUTHOR = "+15005550100";
const NOW = new Date("2026-09-15T12:00:00.000Z");

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

function createExpense(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    sourceAuthor: TEST_SOURCE_AUTHOR,
    sourceTimestamp: 1_700_000_000_000,
    itemIndex: 0,
    amountCents: 1500,
    currency: "PLN",
    category: "groceries",
    occurredOn: "2026-09-10",
    note: "groceries",
    rawText: "groceries 15 pln",
    ...overrides,
  };
}

describe("handleReport", () => {
  let tempDir: string;
  let deps: AppDeps;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-report-test-"));
    const db = openDatabase(join(tempDir, "expenses.db"));
    initSchema(db);
    deps = { db, config, now: () => NOW };
  });

  afterEach(() => {
    deps.db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty this_month totals", async () => {
    const result = await handleReport(deps, {
      intent: "report",
      period: "this_month",
      group_by: "total",
    });

    expect(result).toEqual({
      kind: "success",
      message: "📊 Report: this month\n\nno expenses",
    });
  });

  it("sums this_month totals per currency", async () => {
    insertExpenses(deps.db, [
      createExpense({ itemIndex: 0, amountCents: 1500, currency: "PLN" }),
      createExpense({
        itemIndex: 1,
        amountCents: 2000,
        currency: "PLN",
        category: "food",
        occurredOn: "2026-09-20",
      }),
      createExpense({
        sourceTimestamp: 1_700_000_000_001,
        itemIndex: 0,
        amountCents: 1000,
        currency: "EUR",
        category: "food",
      }),
      createExpense({
        sourceTimestamp: 1_700_000_000_002,
        itemIndex: 0,
        amountCents: 500,
        currency: "PLN",
        occurredOn: "2026-08-15",
      }),
    ]);

    const result = await handleReport(deps, {
      intent: "report",
      period: "this_month",
      group_by: "total",
    });

    expect(result).toEqual({
      kind: "success",
      message: "📊 Report: this month\n\n10.00 EUR\n35.00 PLN",
    });
  });

  it("sums last_month totals", async () => {
    insertExpenses(deps.db, [
      createExpense({
        amountCents: 700,
        occurredOn: "2026-08-02",
      }),
      createExpense({
        sourceTimestamp: 1_700_000_000_003,
        amountCents: 1500,
        occurredOn: "2026-09-10",
      }),
    ]);

    const result = await handleReport(deps, {
      intent: "report",
      period: "last_month",
      group_by: "total",
    });

    expect(result).toEqual({
      kind: "success",
      message: "📊 Report: last month\n\n7.00 PLN",
    });
  });

  it("groups this_month by category and currency", async () => {
    insertExpenses(deps.db, [
      createExpense({
        itemIndex: 0,
        amountCents: 1500,
        category: "groceries",
        currency: "PLN",
      }),
      createExpense({
        itemIndex: 1,
        amountCents: 500,
        category: "groceries",
        currency: "PLN",
        occurredOn: "2026-09-12",
      }),
      createExpense({
        sourceTimestamp: 1_700_000_000_004,
        itemIndex: 0,
        amountCents: 1000,
        category: "food",
        currency: "EUR",
      }),
      createExpense({
        sourceTimestamp: 1_700_000_000_005,
        itemIndex: 0,
        amountCents: 300,
        category: "food",
        currency: "PLN",
      }),
    ]);

    const result = await handleReport(deps, {
      intent: "report",
      period: "this_month",
      group_by: "category",
    });

    expect(result).toEqual({
      kind: "success",
      message:
        "📊 Report: this month\n\nfood: 10.00 EUR\nfood: 3.00 PLN\ngroceries: 20.00 PLN",
    });
  });
});
