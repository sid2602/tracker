import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { initSchema, openDatabase } from "../db/connection.js";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../db/schema.js";
import type { Config } from "../config.js";
import type { AppDeps } from "./types.js";
import { saveToInbox, processNextInboxItem } from "./inbox.js";
import type { ModificationResult } from "../domains/modifications/schema.js";

const routeMessageMock = vi.fn();
const parseExpensesMock = vi.fn();
const parseModificationMock = vi.fn<
  (config: Config, text: string, referenceDate: string) => Promise<ModificationResult>
>();
const sendMessageMock = vi.fn();

vi.mock("../routing/router.js", () => ({
  routeMessage: (config: Config, text: string) => routeMessageMock(config, text),
}));

vi.mock("../domains/expenses/parser.js", () => ({
  parseExpenses: (
    config: Config,
    text: string,
    referenceDate: string,
    categories: unknown,
  ) => parseExpensesMock(config, text, referenceDate, categories),
}));

vi.mock("../domains/modifications/parser.js", () => ({
  parseModification: (
    config: Config,
    text: string,
    referenceDate: string,
  ) => parseModificationMock(config, text, referenceDate),
}));

vi.mock("../signal/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../signal/index.js")>();
  return {
    ...actual,
    sendMessage: (config: Config, recipient: string, message: string) =>
      sendMessageMock(config, recipient, message),
  };
});

vi.mock("../tracing.js", () => ({
  withMessageTrace: async (_attrs: unknown, callback: () => Promise<void>) => callback(),
  recordMessageTrace: vi.fn(),
}));

vi.mock("../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("inbox integration", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;

  const config: Config = {
    aiGatewayApiKey: "test-gateway-key",
    llmProvider: "openai",
    llmModel: "gpt-4o-mini",
    databasePath: ":memory:",
    signalRpcHost: "signal-cli-rest-api",
    signalRpcPort: 6001,
    signalPhoneNumber: "+15005550100",
    signalAllowedInputDeviceIds: [1],
    langfusePublicKey: null,
    langfuseSecretKey: null,
    langfuseBaseUrl: "https://cloud.langfuse.com",
  };

  const payload = {
    envelope: {
      source: "+15005550100",
      sourceDevice: 1,
      timestamp: 1_700_000_000_000,
      dataMessage: {
        message: "kawa 15 zl",
      },
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    db = openDatabase(":memory:");
    await initSchema(db);
    deps = { db, config, now: () => new Date(1_000_000) };
    routeMessageMock.mockResolvedValue({ intent: "expense" });
    parseExpensesMock.mockResolvedValue({
      items: [
        {
          amountCents: 1500,
          currency: "PLN",
          category: "food",
          occurredOn: "2026-09-11",
          note: "kawa",
        },
      ],
    });
    parseModificationMock.mockResolvedValue({
      action: "delete",
      target: "last",
    });
    sendMessageMock.mockResolvedValue(undefined);
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("persists a real expense and inbox response in the durable flow", async () => {
    await saveToInbox(deps, payload);

    await processNextInboxItem(deps);

    const expenses = await db.selectFrom("expenses").selectAll().execute();
    const inboxItem = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.source_message_key).toBe(
      "+15005550100-1-1700000000000",
    );
    expect(inboxItem.status).toBe("confirmed");
    expect(inboxItem.parsed_json).not.toBeNull();
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("rolls back the domain effect when saving the inbox result fails", async () => {
    await saveToInbox(deps, payload);
    await sql`
      CREATE TRIGGER fail_saved_transition
      BEFORE UPDATE OF status ON inbox
      WHEN NEW.status = 'saved'
      BEGIN
        SELECT RAISE(ABORT, 'forced saved transition failure');
      END
    `.execute(db);

    await processNextInboxItem(deps);

    const expenses = await db.selectFrom("expenses").selectAll().execute();
    const inboxItem = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(expenses).toHaveLength(0);
    expect(inboxItem.status).toBe("analyzed");
    expect(inboxItem.parsed_json).not.toBeNull();
    expect(inboxItem.attempts).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("rolls back a modification when saving the inbox result fails", async () => {
    routeMessageMock.mockResolvedValue({ intent: "modification" });
    await db
      .insertInto("expenses")
      .values({
        source_author: "+15005550100",
        source_timestamp: 1_700_000_000_001,
        item_index: 0,
        amount_cents: 1500,
        currency: "PLN",
        category: "food",
        occurred_on: "2026-09-11",
        note: "kawa",
        raw_text: "kawa 15 zl",
        created_at: new Date().toISOString(),
      })
      .execute();
    await saveToInbox(deps, {
      envelope: {
        source: "+15005550100",
        sourceDevice: 1,
        timestamp: 1_700_000_000_002,
        dataMessage: {
          message: "usuń ostatni",
        },
      },
    });

    await sql`
      CREATE TRIGGER fail_modification_saved_transition
      BEFORE UPDATE OF status ON inbox
      WHEN NEW.status = 'saved'
      BEGIN
        SELECT RAISE(ABORT, 'forced modification transition failure');
      END
    `.execute(db);

    await processNextInboxItem(deps);

    const expenses = await db.selectFrom("expenses").selectAll().execute();
    const inboxItem = await db
      .selectFrom("inbox")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(expenses).toHaveLength(1);
    expect(inboxItem.status).toBe("analyzed");
    expect(inboxItem.parsed_json).not.toBeNull();
    expect(inboxItem.attempts).toBe(1);
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("persists semantic modification feedback without mutating data", async () => {
    routeMessageMock.mockResolvedValue({ intent: "modification" });
    await db
      .insertInto("expenses")
      .values({
        source_author: "+15005550100",
        source_timestamp: 1_700_000_000_001,
        item_index: 0,
        amount_cents: 1500,
        currency: "PLN",
        category: "food",
        occurred_on: "2026-09-11",
        note: "kawa",
        raw_text: "kawa 15 zl",
        created_at: new Date().toISOString(),
      })
      .execute();
    await saveToInbox(deps, {
      envelope: {
        source: "+15005550100",
        sourceDevice: 1,
        timestamp: 1_700_000_000_003,
        dataMessage: {
          message: "usuń ostatnią kawę",
        },
      },
    });

    await processNextInboxItem(deps);

    const expenses = await db.selectFrom("expenses").selectAll().execute();
    const inboxItem = await db
      .selectFrom("inbox")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(expenses).toHaveLength(1);
    expect(inboxItem.status).toBe("confirmed");
    expect(inboxItem.response_text).toBe(
      "I could not safely identify the requested expense. Please specify its ID or exact date/details.",
    );
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });
});
