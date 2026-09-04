import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initSchema, openDatabase } from "../../db/connection.js";
import {
  findMatchingExpenses,
  deleteExpense,
  updateExpense
} from "./repository.js";

const TEST_SOURCE_AUTHOR = "+48000000000";

describe("modifications repository", () => {
  let tempDir: string;
  let dbPath: string;
  let db: any;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-mod-repo-test-"));
    dbPath = join(tempDir, "expenses.db");
    db = openDatabase(dbPath);
    await initSchema(db);

    await db.insertInto("expenses").values([
      {
        source_author: TEST_SOURCE_AUTHOR,
        source_timestamp: 100,
        item_index: 0,
        amount_cents: 1500,
        currency: "PLN",
        category: "Kawa",
        occurred_on: "2026-09-01",
        note: "kawa w costa",
        raw_text: "kawa 15 zl",
        created_at: new Date().toISOString(),
      },
      {
        source_author: TEST_SOURCE_AUTHOR,
        source_timestamp: 101,
        item_index: 0,
        amount_cents: 4000,
        currency: "PLN",
        category: "Jedzenie",
        occurred_on: "2026-09-01",
        note: "obiad",
        raw_text: "obiad 40 zl",
        created_at: new Date().toISOString(),
      }
    ]).execute();
  });

  afterEach(async () => {
    await db.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("findMatchingExpenses returns the last expense", async () => {
    const matches = await findMatchingExpenses(db, TEST_SOURCE_AUTHOR, {
      action: "delete", target: "last"
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].category).toBe("Jedzenie");
  });

  it("findMatchingExpenses searches by keyword", async () => {
    const matches = await findMatchingExpenses(db, TEST_SOURCE_AUTHOR, {
      action: "delete", target: "specific", searchCriteria: { keyword: "costa" }
    });
    expect(matches).toHaveLength(1);
    expect(matches[0].category).toBe("Kawa");
  });

  it("deleteExpense removes the record", async () => {
    const expenses = await db.selectFrom("expenses").selectAll().execute();
    const id = expenses[0].id;
    await deleteExpense(db, id);
    const after = await db.selectFrom("expenses").selectAll().execute();
    expect(after).toHaveLength(1);
    expect(after[0].id).not.toBe(id);
  });

  it("updateExpense updates the record", async () => {
    const expenses = await db.selectFrom("expenses").selectAll().execute();
    const id = expenses[0].id;
    await updateExpense(db, id, { category: "Rozrywka", amountCents: 9900 });
    const updated = await db.selectFrom("expenses").selectAll().where("id", "=", id).execute();
    expect(updated[0].category).toBe("Rozrywka");
    expect(updated[0].amount_cents).toBe(9900);
  });
});
