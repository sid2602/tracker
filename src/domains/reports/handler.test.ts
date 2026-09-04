import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config.js";
import { initSchema, openDatabase } from "../../db/connection.js";
import {
  insertExpenses,
  type ExpenseInput,
} from "../expenses/repository.js";
import type { AppDeps } from "../../worker/types.js";
import { handleReport } from "./handler.js";
import type { ReportParams } from "./schema.js";

const TEST_SOURCE_AUTHOR = "+15005550100";
const NOW = new Date("2026-09-15T12:00:00.000Z");
const context = {
  messageKey: "test-key", sourceAuthor: TEST_SOURCE_AUTHOR,
  sourceTimestamp: 1_700_000_000_000,
  rawText: "report",
};

const parseReportMock = vi.fn<
  (config: Config, text: string, currentDateStr: string) => Promise<ReportParams>
>();

vi.mock("./parser.js", () => ({
  parseReport: (configArg: Config, text: string, currentDateStr: string) =>
    parseReportMock(configArg, text, currentDateStr),
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

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-report-test-"));
    const db = openDatabase(join(tempDir, "expenses.db"));
    await initSchema(db);
    deps = { db, config, now: () => NOW };
    parseReportMock.mockReset();
  });

  afterEach(async () => {
    await deps.db.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns empty totals", async () => {
    parseReportMock.mockResolvedValue({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      title: "This month",
      group_by: "total",
    });

    const result = await handleReport(deps, context);

    expect(result).toEqual({
      kind: "success",
      message: "📊 Report: This month\n\nno expenses",
    });
  });

  it("sums totals per currency for given date range", async () => {
    await insertExpenses(deps.db, [
      createExpense({ itemIndex: 0, amountCents: 1500, currency: "PLN", occurredOn: "2026-09-10" }),
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
        occurredOn: "2026-09-15",
      }),
      createExpense({
        sourceTimestamp: 1_700_000_000_002,
        itemIndex: 0,
        amountCents: 500,
        currency: "PLN",
        occurredOn: "2026-08-15",
      }),
    ]);

    parseReportMock.mockResolvedValue({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      title: "Wrzesień 2026",
      group_by: "total",
    });

    const result = await handleReport(deps, context);

    expect(result).toEqual({
      kind: "success",
      message: "📊 Report: Wrzesień 2026\n\n10.00 EUR\n35.00 PLN",
    });
  });

  it("groups by category and currency", async () => {
    await insertExpenses(deps.db, [
      createExpense({
        itemIndex: 0,
        amountCents: 1500,
        category: "groceries",
        currency: "PLN",
        occurredOn: "2026-09-10",
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
        occurredOn: "2026-09-11",
      }),
    ]);

    parseReportMock.mockResolvedValue({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      title: "This month",
      group_by: "category",
    });

    const result = await handleReport(deps, context);

    expect(result).toEqual({
      kind: "success",
      message:
        "📊 Report: This month\n\nfood: 10.00 EUR\ngroceries: 20.00 PLN",
    });
  });

  it("filters by category", async () => {
    await insertExpenses(deps.db, [
      createExpense({
        itemIndex: 0,
        amountCents: 1500,
        category: "groceries",
        currency: "PLN",
        occurredOn: "2026-09-10",
      }),
      createExpense({
        itemIndex: 1,
        amountCents: 500,
        category: "transport",
        currency: "PLN",
        occurredOn: "2026-09-12",
      }),
    ]);

    parseReportMock.mockResolvedValue({
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      title: "Transport this month",
      group_by: "total",
      categories: ["transport"],
    });

    const result = await handleReport(deps, context);

    expect(result).toEqual({
      kind: "success",
      message:
        "📊 Report: Transport this month\n\n5.00 PLN",
    });
  });
});
