import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createWorkflowHarness,
  FIRST_MESSAGE_TIMESTAMP,
  type WorkflowHarness,
} from "./harness.js";

describe("application workflow: routing outcomes", () => {
  let harness: WorkflowHarness;

  beforeEach(async () => {
    harness = await createWorkflowHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("ignores an unrelated incoming message without a response", async () => {
    const rawText = "hej, co tam?";
    const expensesBefore = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .execute();
    const categoriesBefore = await harness.db
      .selectFrom("categories")
      .selectAll()
      .orderBy("name")
      .execute();
    harness.scriptLlm("llm.router", { intent: "ignore" }, [rawText]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 8);

    await harness.expectIgnored();
    const expensesAfter = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .execute();
    const categoriesAfter = await harness.db
      .selectFrom("categories")
      .selectAll()
      .orderBy("name")
      .execute();
    expect(expensesAfter).toEqual(expensesBefore);
    expect(categoriesAfter).toEqual(categoriesBefore);
    expect(harness.getLlmCalls()).toHaveLength(1);
    harness.expectLlmCallSequence("llm.router");
  });
});
