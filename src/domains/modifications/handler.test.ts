import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config.js";
import { initSchema, openDatabase } from "../../db/connection.js";
import type { AppDeps } from "../../worker/types.js";
import { handleModification } from "./handler.js";
import type { ModificationResult } from "./schema.js";

const TEST_SOURCE_AUTHOR = "+48000000000";

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

const parseModificationMock = vi.fn<
  (config: Config, text: string) => Promise<ModificationResult>
>();

vi.mock("./parser.js", () => ({
  parseModification: (configArg: Config, text: string) => parseModificationMock(configArg, text),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe("handleModification", () => {
  let tempDir: string;
  let dbPath: string;
  let deps: AppDeps;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-mod-test-"));
    dbPath = join(tempDir, "expenses.db");
    const db = openDatabase(dbPath);
    await initSchema(db);
    deps = { db, config };
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
    rmSync(tempDir, { recursive: true, force: true });
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
      updatePayload: { category: "Rozrywka", amountCents: null },
    });

    const result = await handleModification(deps, {
      messageKey: "msg-1", sourceAuthor: TEST_SOURCE_AUTHOR, sourceTimestamp: 200, rawText: "zmien kategorie kawy na rozrywka"
    });

    expect(result).toMatchObject({ kind: "success" });
    const expenses = await deps.db.selectFrom("expenses").selectAll().where("category", "=", "Rozrywka").execute();
    expect(expenses).toHaveLength(1);
  });
});
