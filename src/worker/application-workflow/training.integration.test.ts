import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TrainingLogResult } from "../../products/training/domains/entries/schema.js";
import type { TrainingReportParams } from "../../products/training/domains/reports/schema.js";
import { TRAINING_CORRECTION_MISROUTE_MESSAGE } from "../../products/training/domains/entries/correction-guard.js";
import {
  createWorkflowHarness,
  FIRST_MESSAGE_TIMESTAMP,
  REFERENCE_DATE,
  type WorkflowHarness,
} from "./harness.js";

describe("application workflow: training log and report", () => {
  let harness: WorkflowHarness;

  beforeEach(async () => {
    harness = await createWorkflowHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("logs sets across multiple messages on the same day", async () => {
    const parsedSet: TrainingLogResult = {
      entries: [
        {
          exercise: "podciąganie",
          occurredOn: REFERENCE_DATE,
          kind: "strength",
          reps: 8,
          weightGrams: null,
          durationSeconds: null,
          setIndex: 1,
          setsCount: null,
          note: "",
        },
      ],
    };

    for (let index = 0; index < 3; index += 1) {
      const rawText = "podciąganie 8";
      harness.scriptLlm("llm.router", { intent: "training.log" }, [rawText]);
      harness.scriptLlm("llm.training.log", parsedSet, [rawText, REFERENCE_DATE]);
      await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + index);
    }

    const entries = await harness.db
      .selectFrom("training_entries")
      .selectAll()
      .orderBy("source_timestamp", "asc")
      .execute();
    expect(entries).toHaveLength(3);
    expect(entries.every((entry) => entry.occurred_on === REFERENCE_DATE)).toBe(
      true,
    );
    expect(entries.every((entry) => entry.exercise === "podciąganie")).toBe(
      true,
    );

    const expenses = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .execute();
    expect(expenses).toHaveLength(0);
  });

  it("expands a 3x8 prescription into three training_entries", async () => {
    const rawText = "przysiad 3x8 80kg";
    const parsed: TrainingLogResult = {
      entries: [
        {
          exercise: "przysiad",
          occurredOn: REFERENCE_DATE,
          kind: "strength",
          reps: 8,
          weightGrams: 80000,
          durationSeconds: null,
          setIndex: null,
          setsCount: 3,
          note: "",
        },
      ],
    };

    harness.scriptLlm("llm.router", { intent: "training.log" }, [rawText]);
    harness.scriptLlm("llm.training.log", parsed, [rawText, REFERENCE_DATE]);
    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 10);

    const entries = await harness.db
      .selectFrom("training_entries")
      .select(["reps", "set_index", "weight_grams"])
      .orderBy("item_index", "asc")
      .execute();
    expect(entries).toEqual([
      { reps: 8, set_index: 1, weight_grams: 80000 },
      { reps: 8, set_index: 2, weight_grams: 80000 },
      { reps: 8, set_index: 3, weight_grams: 80000 },
    ]);
  });

  it("reports training entries for the day in time order", async () => {
    await harness.db
      .insertInto("training_entries")
      .values([
        {
          source_message_key: "a",
          source_author: harness.config.signalPhoneNumber,
          source_timestamp: 2,
          item_index: 0,
          occurred_on: REFERENCE_DATE,
          exercise: "podciąganie",
          set_index: 2,
          reps: 7,
          weight_grams: null,
          duration_seconds: null,
          kind: "strength",
          note: "",
          raw_text: "podciąganie 7",
          created_at: new Date().toISOString(),
        },
        {
          source_message_key: "b",
          source_author: harness.config.signalPhoneNumber,
          source_timestamp: 1,
          item_index: 0,
          occurred_on: REFERENCE_DATE,
          exercise: "podciąganie",
          set_index: 1,
          reps: 8,
          weight_grams: null,
          duration_seconds: null,
          kind: "strength",
          note: "",
          raw_text: "podciąganie 8",
          created_at: new Date().toISOString(),
        },
      ])
      .execute();

    const rawText = "co robiłem na treningu dziś?";
    const params: TrainingReportParams = {
      start_date: REFERENCE_DATE,
      end_date: REFERENCE_DATE,
      title: "Today",
      exercise: null,
    };
    harness.scriptLlm("llm.router", { intent: "training.report" }, [rawText]);
    harness.scriptLlm("llm.training.report", params, [rawText, REFERENCE_DATE]);
    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 20);

    const sent = harness.getSentMessages().at(-1)?.message ?? "";
    expect(sent.startsWith("🏋️ Training: Today")).toBe(true);
    const first = sent.indexOf("set 1");
    const second = sent.indexOf("set 2");
    expect(first).toBeGreaterThan(-1);
    expect(second).toBeGreaterThan(first);
    await harness.expectConfirmed(sent);
  });

  it("does not write expenses when logging training", async () => {
    const rawText = "podciąganie 8";
    const parsed: TrainingLogResult = {
      entries: [
        {
          exercise: "podciąganie",
          occurredOn: REFERENCE_DATE,
          kind: "strength",
          reps: 8,
          weightGrams: null,
          durationSeconds: null,
          setIndex: 1,
          setsCount: null,
          note: "",
        },
      ],
    };
    harness.scriptLlm("llm.router", { intent: "training.log" }, [rawText]);
    harness.scriptLlm("llm.training.log", parsed, [rawText, REFERENCE_DATE]);
    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 30);

    expect(
      await harness.db.selectFrom("expenses").selectAll().execute(),
    ).toHaveLength(0);
    expect(
      await harness.db.selectFrom("training_entries").selectAll().execute(),
    ).toHaveLength(1);
  });

  it("does not write training_entries when logging an expense", async () => {
    const rawText = "kawa 15 zł";
    harness.scriptLlm("llm.router", { intent: "expenses.create" }, [rawText]);
    harness.scriptLlm(
      "llm.expense",
      {
        items: [
          {
            amountCents: 1500,
            currency: "PLN",
            category: "food",
            occurredOn: REFERENCE_DATE,
            note: "kawa",
          },
        ],
      },
      [rawText, REFERENCE_DATE, "CATEGORY CATALOG", "food"],
    );
    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 40);

    expect(
      await harness.db.selectFrom("expenses").selectAll().execute(),
    ).toHaveLength(1);
    expect(
      await harness.db.selectFrom("training_entries").selectAll().execute(),
    ).toHaveLength(0);
  });

  it("fail-closes when a set correction is misrouted as training.log", async () => {
    const rawText = "3 seria 7";
    harness.scriptLlm("llm.router", { intent: "training.log" }, [rawText]);
    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 50);

    expect(
      await harness.db.selectFrom("training_entries").selectAll().execute(),
    ).toHaveLength(0);
    await harness.expectConfirmed(
      TRAINING_CORRECTION_MISROUTE_MESSAGE,
    );
    expect(harness.getLlmCalls().map((call) => call.operation)).toEqual([
      "llm.router",
    ]);
  });

  it("corrects set 3 after a 3x8 prescription to reps 8,8,7", async () => {
    const prescription = "podciąganie 3x8";
    harness.scriptLlm("llm.router", { intent: "training.log" }, [prescription]);
    harness.scriptLlm(
      "llm.training.log",
      {
        entries: [
          {
            exercise: "podciąganie",
            occurredOn: REFERENCE_DATE,
            kind: "strength",
            reps: 8,
            weightGrams: null,
            durationSeconds: null,
            setIndex: null,
            setsCount: 3,
            note: "",
          },
        ],
      },
      [prescription, REFERENCE_DATE],
    );
    await harness.runWorkflow(prescription, FIRST_MESSAGE_TIMESTAMP + 60);

    const correction = "3 seria 7";
    harness.scriptLlm(
      "llm.router",
      { intent: "training.modification" },
      [correction],
    );
    await harness.runWorkflow(correction, FIRST_MESSAGE_TIMESTAMP + 61);

    const reps = await harness.db
      .selectFrom("training_entries")
      .select(["set_index", "reps"])
      .orderBy("item_index", "asc")
      .execute();
    expect(reps).toEqual([
      { set_index: 1, reps: 8 },
      { set_index: 2, reps: 8 },
      { set_index: 3, reps: 7 },
    ]);
    const sent = harness.getSentMessages().at(-1)?.message ?? "";
    expect(sent).toBe("Updated podciąganie set 3 to 7 reps.");
    expect(harness.getSendCallCount()).toBe(2);
  });

  it("deletes the last training entry", async () => {
    const rawText = "podciąganie 8";
    harness.scriptLlm("llm.router", { intent: "training.log" }, [rawText]);
    harness.scriptLlm(
      "llm.training.log",
      {
        entries: [
          {
            exercise: "podciąganie",
            occurredOn: REFERENCE_DATE,
            kind: "strength",
            reps: 8,
            weightGrams: null,
            durationSeconds: null,
            setIndex: 1,
            setsCount: null,
            note: "",
          },
        ],
      },
      [rawText, REFERENCE_DATE],
    );
    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 70);

    const deleteText = "usuń ostatni wpis treningowy";
    harness.scriptLlm(
      "llm.router",
      { intent: "training.modification" },
      [deleteText],
    );
    harness.scriptLlm(
      "llm.training.modification",
      {
        action: "delete",
        target: "last",
        setIndex: null,
        id: null,
        updatePayload: null,
      },
      [deleteText, REFERENCE_DATE],
    );
    await harness.runWorkflow(deleteText, FIRST_MESSAGE_TIMESTAMP + 71);

    expect(
      await harness.db.selectFrom("training_entries").selectAll().execute(),
    ).toHaveLength(0);
    const sent = harness.getSentMessages().at(-1)?.message ?? "";
    expect(sent).toMatch(/^Deleted training entry #/);
  });

  it("fail-closes delete when no training entries exist", async () => {
    const deleteText = "delete last training entry";
    harness.scriptLlm(
      "llm.router",
      { intent: "training.modification" },
      [deleteText],
    );
    harness.scriptLlm(
      "llm.training.modification",
      {
        action: "delete",
        target: "last",
        setIndex: null,
        id: null,
        updatePayload: null,
      },
      [deleteText, REFERENCE_DATE],
    );
    await harness.runWorkflow(deleteText, FIRST_MESSAGE_TIMESTAMP + 80);

    await harness.expectConfirmed(
      "Could not find any training entry matching this description.",
    );
  });
});
