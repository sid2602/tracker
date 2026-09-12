import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CategoryAction } from "../../domains/categories/schema.js";
import type { ModificationResult } from "../../domains/modifications/schema.js";
import {
  createWorkflowHarness,
  FIRST_MESSAGE_TIMESTAMP,
  REFERENCE_DATE,
  type WorkflowHarness,
} from "./harness.js";

describe("application workflow: catalog and modifications", () => {
  let harness: WorkflowHarness;

  beforeEach(async () => {
    harness = await createWorkflowHarness();
  });

  afterEach(async () => {
    await harness.close();
  });

  it("adds a category through the incoming message workflow", async () => {
    const rawText = "dodaj kategorię pets";
    const parsedCategory: CategoryAction = {
      action: "add",
      categoryName: "pets",
      description: null,
    };
    harness.scriptLlm("llm.router", { intent: "category" }, [rawText]);
    harness.scriptLlm("llm.category", parsedCategory, [rawText]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 3);

    const category = await harness.db
      .selectFrom("categories")
      .selectAll()
      .where("name", "=", "pets")
      .executeTakeFirst();
    expect(category?.name).toBe("pets");
    await harness.expectConfirmed("Category added: pets");
    harness.expectLlmCallSequence("llm.router", "llm.category");
  });

  it("lists categories through the incoming message workflow", async () => {
    const rawText = "pokaż moje kategorie";
    const parsedCategory: CategoryAction = {
      action: "list",
      categoryName: null,
    };
    harness.scriptLlm("llm.router", { intent: "category" }, [rawText]);
    harness.scriptLlm("llm.category", parsedCategory, [rawText]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 4);

    await harness.expectConfirmed(
      [
        "Your categories:",
        "- bills (electricity, rent, subscriptions)",
        "- entertainment (cinema, games, events, fun)",
        "- food (restaurants, eating out, ordering in, coffee)",
        "- fuel (gas station, car fuel)",
        "- groceries (supermarkets, daily food shopping)",
        "- health (medicines, doctors, pharmacy)",
        "- home (furniture, home accessories, repairs)",
        "- other (anything else that does not fit)",
        "- transport (uber, public transport, taxis)",
      ].join("\n"),
    );
    harness.expectLlmCallSequence("llm.router", "llm.category");
  });

  it("removes a category through the incoming message workflow", async () => {
    await harness.db
      .insertInto("categories")
      .values({
        name: "pets",
        description: "animals",
        created_at: `${REFERENCE_DATE}T12:00:00.000Z`,
      })
      .execute();

    const rawText = "usuń kategorię pets";
    const parsedCategory: CategoryAction = {
      action: "remove",
      categoryName: "pets",
      description: null,
    };
    harness.scriptLlm("llm.router", { intent: "category" }, [rawText]);
    harness.scriptLlm("llm.category", parsedCategory, [rawText]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 5);

    const category = await harness.db
      .selectFrom("categories")
      .selectAll()
      .where("name", "=", "pets")
      .executeTakeFirst();
    expect(category).toBeUndefined();
    await harness.expectConfirmed("Category removed: pets");
    harness.expectLlmCallSequence("llm.router", "llm.category");
  });

  it("updates an expense through the incoming message workflow", async () => {
    await harness.db
      .insertInto("expenses")
      .values({
        source_message_key: "update-seed",
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
    const seededExpense = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .where("source_message_key", "=", "update-seed")
      .executeTakeFirstOrThrow();

    const rawText = `zmień #${seededExpense.id} kwotę na 20 zł`;
    const parsedModification: ModificationResult = {
      action: "update",
      target: "id",
      id: seededExpense.id,
      searchCriteria: null,
      selection: null,
      updatePayload: { amountCents: 2000, category: null },
    };
    harness.scriptLlm("llm.router", { intent: "modification" }, [rawText]);
    harness.scriptLlm("llm.modification", parsedModification, [
      rawText,
      REFERENCE_DATE,
    ]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 6);

    const updatedExpense = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .where("id", "=", seededExpense.id)
      .executeTakeFirstOrThrow();
    expect(updatedExpense).toMatchObject({
      id: seededExpense.id,
      source_message_key: "update-seed",
      source_author: harness.config.signalPhoneNumber,
      source_timestamp: FIRST_MESSAGE_TIMESTAMP,
      item_index: 0,
      amount_cents: 2000,
      currency: "PLN",
      category: "food",
      occurred_on: REFERENCE_DATE,
      note: "kawa",
      raw_text: "kawa 15 zł",
    });
    await harness.expectConfirmed(`Updated expense #${seededExpense.id}.`);
    harness.expectLlmCallSequence("llm.router", "llm.modification");
  });

  it("deletes an expense through the incoming message workflow", async () => {
    await harness.db
      .insertInto("expenses")
      .values({
        source_message_key: "delete-seed",
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
    const seededExpense = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .where("source_message_key", "=", "delete-seed")
      .executeTakeFirstOrThrow();

    const rawText = `usuń #${seededExpense.id}`;
    const parsedModification: ModificationResult = {
      action: "delete",
      target: "id",
      id: seededExpense.id,
      searchCriteria: null,
      selection: null,
      updatePayload: null,
    };
    harness.scriptLlm("llm.router", { intent: "modification" }, [rawText]);
    harness.scriptLlm("llm.modification", parsedModification, [
      rawText,
      REFERENCE_DATE,
    ]);

    await harness.runWorkflow(rawText, FIRST_MESSAGE_TIMESTAMP + 7);

    const deletedExpense = await harness.db
      .selectFrom("expenses")
      .selectAll()
      .where("id", "=", seededExpense.id)
      .executeTakeFirst();
    expect(deletedExpense).toBeUndefined();
    await harness.expectConfirmed(
      "Deleted expense: food 15.00 PLN on 2026-09-15",
    );
    harness.expectLlmCallSequence("llm.router", "llm.modification");
  });
});
