import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../../../config.js";
import {
  createTestConfig,
  createTestDatabase,
  createTestDeps,
} from "../../../../test/fixtures.js";
import type { AppDeps } from "../../../../worker/types.js";
import { handleModification } from "./handler.js";
import type { ModificationResult } from "./schema.js";

const TEST_SOURCE_AUTHOR = "+48000000000";

const config = createTestConfig();

const parseModificationMock = vi.fn<
  (config: Config, text: string) => Promise<ModificationResult>
>();

vi.mock("./parser.js", () => ({
  parseModification: (configArg: Config, text: string) => parseModificationMock(configArg, text),
}));

vi.mock("../../../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe("handleModification", () => {
  let deps: AppDeps;

  beforeEach(async () => {
    const db = await createTestDatabase();
    deps = createTestDeps(db, { config });
    parseModificationMock.mockReset();
    
    // Seed some expenses
    await deps.db.insertInto("expenses").values([
      {
        source_author: TEST_SOURCE_AUTHOR,
        source_timestamp: 100,
        item_index: 0,
        amount_cents: 1500,
        currency: "PLN",
        category: "Kawa",
        occurred_on: "2026-09-01",
        note: "kawa w costa",
        raw_text: "kawa w costa 15",
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
        note: "obiad z kasią",
        raw_text: "obiad 40 zl",
        created_at: new Date().toISOString(),
      }
    ]).execute();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deps.db.destroy();
  });

  it("deletes the last expense when target is 'last'", async () => {
    parseModificationMock.mockResolvedValue({
      action: "delete",
      target: "last",
      searchCriteria: null,
      id: null,
      updatePayload: null,
    });

    const result = await handleModification(deps, {
      messageKey: "msg-1", sourceAuthor: TEST_SOURCE_AUTHOR, sourceTimestamp: 200, rawText: "cofnij"
    });

    expect(result).toMatchObject({ kind: "success" });
    const count = await deps.db.selectFrom("expenses").selectAll().execute();
    expect(count).toHaveLength(1);
    expect(count[0].category).toBe("Kawa"); // Obiad was deleted
  });

  it("updates expense when target is specific and 1 match found", async () => {
    parseModificationMock.mockResolvedValue({
      action: "update",
      target: "specific",
      searchCriteria: { category: "Kawa", amountCents: null, keyword: null },
      id: null,
      updatePayload: { category: " Food ", amountCents: null },
    });

    const result = await handleModification(deps, {
      messageKey: "msg-1", sourceAuthor: TEST_SOURCE_AUTHOR, sourceTimestamp: 200, rawText: "zmien kategorie kawy na food"
    });

    expect(result).toMatchObject({ kind: "success" });
    const expenses = await deps.db.selectFrom("expenses").selectAll().where("category", "=", "food").execute();
    expect(expenses).toHaveLength(1);
  });

  it("rejects an update to a category outside the global catalog", async () => {
    parseModificationMock.mockResolvedValue({
      action: "update",
      target: "specific",
      searchCriteria: { category: "Kawa", amountCents: null, keyword: null },
      id: null,
      updatePayload: { category: "not-configured", amountCents: null },
    });

    const result = await handleModification(deps, {
      messageKey: "msg-2",
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 201,
      rawText: "zmien kategorie kawy na not-configured",
    });

    expect(result).toEqual({
      kind: "success",
      message: "Category 'not-configured' does not exist. Please choose an existing category.",
    });
    const expenses = await deps.db
      .selectFrom("expenses")
      .selectAll()
      .where("category", "=", "Kawa")
      .execute();
    expect(expenses).toHaveLength(1);
  });

  it("returns user feedback and does not fall back for an incomplete selector", async () => {
    parseModificationMock.mockResolvedValue({
      action: "delete",
      target: "specific",
      searchCriteria: null,
      id: null,
      updatePayload: null,
    });

    const result = await handleModification(deps, {
      messageKey: "msg-3",
      sourceAuthor: TEST_SOURCE_AUTHOR,
      sourceTimestamp: 202,
      rawText: "delete this",
    });

    expect(result).toEqual({
      kind: "success",
      message: "Please identify one expense by ID or provide unambiguous details.",
    });
    const expenses = await deps.db.selectFrom("expenses").selectAll().execute();
    expect(expenses).toHaveLength(2);
  });
});
