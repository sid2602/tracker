import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExpenseResult } from "../../products/expenses/domains/expenses/schema.js";
import type { ReportParams } from "../../products/expenses/domains/reports/schema.js";
import {
  createWorkflowHarness,
  FIRST_MESSAGE_TIMESTAMP,
  REFERENCE_DATE,
  type WorkflowHarness,
} from "./harness.js";

describe("application workflow: expenses and reports", () => {
  let harness: WorkflowHarness;

  beforeEach(async () => {
    harness = await createWorkflowHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("records one expense from an incoming Signal message", async () => {
    const rawText = "kawa 15 zł";
    const parsedExpense: ExpenseResult = {
      items: [
        {
          amountCents: 1500,
          currency: "PLN",
          category: "food",
          occurredOn: REFERENCE_DATE,
          note: "kawa",
        },
      ],
    };

    harness.scriptLlm("llm.router", { intent: "expenses.create" }, [rawText]);
    harness.scriptLlm("llm.expense", parsedExpense, [
      rawText,
      REFERENCE_DATE,
      "CATEGORY CATALOG",
      "food",
    ]);

    await harness.runWorkflow(rawText);

    const expenses = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .execute();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      source_author: harness.config.signalPhoneNumber,
      amount_cents: 1500,
      currency: "PLN",
      category: "food",
      occurred_on: REFERENCE_DATE,
      note: "kawa",
      raw_text: rawText,
    });
    await harness.expectConfirmed("Saved 1 item");
    harness.expectLlmCallSequence("llm.router", "llm.expense");
  });

  it("records multiple expenses from one incoming message", async () => {
    const rawText = "chleb 10 zł i mleko 5 zł";
    const parsedExpense: ExpenseResult = {
      items: [
        {
          amountCents: 1000,
          currency: "PLN",
          category: "groceries",
          occurredOn: REFERENCE_DATE,
          note: "chleb",
        },
        {
          amountCents: 500,
          currency: "PLN",
          category: "groceries",
          occurredOn: REFERENCE_DATE,
          note: "mleko",
        },
      ],
    };

    harness.scriptLlm("llm.router", { intent: "expenses.create" }, [rawText]);
    harness.scriptLlm("llm.expense", parsedExpense, [
      rawText,
      REFERENCE_DATE,
      "groceries",
    ]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 1);

    const expenses = await harness.db
      .selectFrom("expenses")
      .select(["amount_cents", "note"])
      .orderBy("item_index", "asc")
      .execute();
    expect(expenses).toEqual([
      { amount_cents: 1000, note: "chleb" },
      { amount_cents: 500, note: "mleko" },
    ]);
    await harness.expectConfirmed("Saved 2 items");
    harness.expectLlmCallSequence("llm.router", "llm.expense");
  });

  it("generates a report from expenses already in the test database", async () => {
    await harness.db
      .insertInto("expenses")
      .values({
        source_message_key: "seed-message",
        source_author: harness.config.signalPhoneNumber,
        source_timestamp: FIRST_MESSAGE_TIMESTAMP,
        item_index: 0,
        amount_cents: 1500,
        currency: "PLN",
        category: "food",
        occurred_on: REFERENCE_DATE,
        note: "kawa",
        raw_text: "kawa 15 zł",
        created_at: `${REFERENCE_DATE}T12:00:00.000Z`,
      })
      .execute();

    const rawText = "ile wydałem we wrześniu?";
    const parsedReport: ReportParams = {
      start_date: "2026-09-01",
      end_date: "2026-09-30",
      title: "Wrzesień",
      group_by: "total",
    };
    harness.scriptLlm("llm.router", { intent: "expenses.report" }, [rawText]);
    harness.scriptLlm("llm.report.parse", parsedReport, [
      rawText,
      REFERENCE_DATE,
    ]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 2);

    await harness.expectConfirmed("📊 Report: Wrzesień\n\n15.00 PLN");
    const expenses = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .execute();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]).toMatchObject({
      amount_cents: 1500,
      currency: "PLN",
      category: "food",
      occurred_on: REFERENCE_DATE,
      note: "kawa",
      raw_text: "kawa 15 zł",
    });
    harness.expectLlmCallSequence("llm.router", "llm.report.parse");
  });
});
