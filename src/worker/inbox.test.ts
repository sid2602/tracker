import { beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "kysely";
import { saveToInbox, processNextInboxItem } from "./inbox.js";
import { openDatabase, initSchema } from "../db/connection.js";
import type { AppDeps, HandlerResult, MessageContext } from "./types.js";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../db/schema.js";
import type { MessageAnalysis } from "./analysis.js";
import { UserInputError } from "./errors.js";

const analyzeMessageMock = vi.fn<
  (deps: AppDeps, context: MessageContext) => Promise<MessageAnalysis>
>();
const persistAnalyzedMessageMock = vi.fn<
  (
    deps: AppDeps,
    context: MessageContext,
    analysis: MessageAnalysis,
    db: unknown,
  ) => Promise<HandlerResult>
>();
const sendMessageMock = vi.fn();

vi.mock("./dispatch.js", () => ({
  analyzeMessage: (deps: AppDeps, context: MessageContext) =>
    analyzeMessageMock(deps, context),
  persistAnalyzedMessage: (
    deps: AppDeps,
    context: MessageContext,
    analysis: MessageAnalysis,
    db: unknown,
  ) => persistAnalyzedMessageMock(deps, context, analysis, db),
  normalizeHandlerResult: (result: HandlerResult) => result,
  recordProcessedMessageTrace: vi.fn(),
}));

vi.mock("../signal/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../signal/index.js")>();
  return {
    ...actual,
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
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

describe("inbox", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;
  let mockNowMs: number;

  beforeEach(async () => {
    vi.resetAllMocks();
    mockNowMs = 1_000_000;

    db = openDatabase(":memory:");
    await initSchema(db);

    deps = {
      db,
      config: {
        signalRpcHost: "signal-cli-rest-api",
        signalRpcPort: 6001,
        signalPhoneNumber: "+123",
        llmProvider: "openai",
        llmModel: "gpt",
        databasePath: ":memory:",
        langfusePublicKey: null,
        langfuseSecretKey: null,
        langfuseBaseUrl: "",
        aiGatewayApiKey: "",
      },
      now: () => new Date(mockNowMs),
    };
  });

  const validPayload = {
    envelope: {
      source: "+15005550100",
      sourceDevice: 1,
      timestamp: 1_700_000_000_000,
      dataMessage: {
        message: "test message",
      },
    },
  };

  const expenseAnalysis: MessageAnalysis = {
    version: 1,
    intent: "expense",
    parsed: {
      items: [
        {
          amountCents: 1500,
          currency: "PLN",
          category: "food",
          occurredOn: "2026-09-11",
          note: "test message",
        },
      ],
    },
  };

  it("saves the original payload to the inbox", async () => {
    await saveToInbox(deps, validPayload);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items).toHaveLength(1);
    expect(items[0]?.message_key).toBe("+15005550100-1-1700000000000");
    expect(items[0]?.status).toBe("pending");
    expect(items[0]?.raw_envelope).toBe(JSON.stringify(validPayload));
    expect(items[0]?.received_at).toBe(mockNowMs);
  });

  it("analyzes, persists, delivers, and confirms a pending item", async () => {
    await saveToInbox(deps, validPayload);
    analyzeMessageMock.mockResolvedValue(expenseAnalysis);
    persistAnalyzedMessageMock.mockResolvedValue({
      kind: "success",
      message: "Expense saved",
    });

    const didWork = await processNextInboxItem(deps);

    expect(didWork).toBe(true);
    expect(analyzeMessageMock).toHaveBeenCalledTimes(1);
    expect(persistAnalyzedMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      deps.config,
      "+15005550100",
      "Expense saved",
    );

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items[0]?.status).toBe("confirmed");
    expect(items[0]?.parsed_json).toBe(JSON.stringify(expenseAnalysis));
    expect(items[0]?.response_text).toBe("Expense saved");
    expect(items[0]?.lease_token).toBeNull();
    expect(items[0]?.lease_until).toBeNull();
  });

  it("ignores a message during analysis without sending a response", async () => {
    await saveToInbox(deps, validPayload);
    analyzeMessageMock.mockResolvedValue({ version: 1, intent: "ignore" });

    const didWork = await processNextInboxItem(deps);

    expect(didWork).toBe(true);
    expect(analyzeMessageMock).toHaveBeenCalledTimes(1);
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items[0]?.status).toBe("ignored");
    expect(items[0]?.lease_token).toBeNull();
    expect(items[0]?.lease_until).toBeNull();
  });

  it("retries technical analysis failures", async () => {
    await saveToInbox(deps, validPayload);
    analyzeMessageMock.mockRejectedValue(new Error("AI Gateway Error"));

    const didWork = await processNextInboxItem(deps);

    expect(didWork).toBe(true);
    expect(sendMessageMock).not.toHaveBeenCalled();

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items[0]?.status).toBe("pending");
    expect(items[0]?.attempts).toBe(1);
    expect(items[0]?.last_error).toBe("AI Gateway Error");
    expect(items[0]?.lease_token).toBeNull();
    expect(items[0]?.lease_until).toBeNull();
    expect(items[0]?.next_attempt_at).toBe(mockNowMs + 30_000);
  });

  it("saves user feedback instead of retrying semantic input errors", async () => {
    await saveToInbox(deps, validPayload);
    analyzeMessageMock.mockRejectedValue(
      new UserInputError("Please include an amount."),
    );

    await processNextInboxItem(deps);

    expect(sendMessageMock).toHaveBeenCalledWith(
      deps.config,
      "+15005550100",
      "Please include an amount.",
    );
    const item = await db
      .selectFrom("inbox")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item.status).toBe("confirmed");
    expect(item.attempts).toBe(0);
  });

  it("does not create a saved row without response text when feedback persistence fails", async () => {
    await saveToInbox(deps, validPayload);
    await sql`
      CREATE TRIGGER fail_user_feedback
      BEFORE UPDATE OF status ON inbox
      WHEN NEW.status = 'saved'
      BEGIN
        SELECT RAISE(ABORT, 'forced feedback failure');
      END
    `.execute(db);
    analyzeMessageMock.mockRejectedValue(new UserInputError("Please include an amount."));

    await processNextInboxItem(deps);

    const item = await db
      .selectFrom("inbox")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item.status).toBe("pending");
    expect(item.response_text).toBeNull();
    expect(item.attempts).toBe(1);
  });

  it("replays analyzed items without calling the analyzer", async () => {
    await saveToInbox(deps, validPayload);
    await db
      .updateTable("inbox")
      .set({
        status: "analyzed",
        parsed_json: JSON.stringify(expenseAnalysis),
      })
      .execute();
    persistAnalyzedMessageMock.mockResolvedValue({
      kind: "success",
      message: "Replayed",
    });

    await processNextInboxItem(deps);

    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
  });

  it("recovers saved items without rerunning analysis or persistence", async () => {
    await saveToInbox(deps, validPayload);
    await db
      .updateTable("inbox")
      .set({
        status: "saved",
        response_text: "Saved before crash",
      })
      .execute();

    await processNextInboxItem(deps);

    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(
      deps.config,
      "+15005550100",
      "Saved before crash",
    );

    const item = await db
      .selectFrom("inbox")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item.status).toBe("confirmed");
  });

  it("keeps saved state when Signal delivery fails", async () => {
    await saveToInbox(deps, validPayload);
    analyzeMessageMock.mockResolvedValue(expenseAnalysis);
    persistAnalyzedMessageMock.mockResolvedValue({
      kind: "success",
      message: "Needs delivery",
    });
    sendMessageMock.mockRejectedValue(new Error("Signal unavailable"));

    await processNextInboxItem(deps);

    const item = await db
      .selectFrom("inbox")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item.status).toBe("saved");
    expect(item.response_text).toBe("Needs delivery");
    expect(item.attempts).toBe(1);
    expect(item.last_error).toBe("Signal unavailable");
    expect(item.next_attempt_at).toBe(mockNowMs + 30_000);
  });

  it("moves an item to failed after the retry limit", async () => {
    await saveToInbox(deps, validPayload);
    await db
      .updateTable("inbox")
      .set({ attempts: 4 })
      .execute();
    analyzeMessageMock.mockRejectedValue(new Error("permanent failure"));

    await processNextInboxItem(deps);

    const item = await db
      .selectFrom("inbox")
      .selectAll()
      .executeTakeFirstOrThrow();
    expect(item.status).toBe("failed");
    expect(item.attempts).toBe(5);
    expect(item.failed_at).toBe(mockNowMs);
    expect(item.next_attempt_at).toBeNull();
  });

  it("does not pick up items that have an active lease", async () => {
    await saveToInbox(deps, validPayload);
    await db
      .updateTable("inbox")
      .set({
        lease_token: "active-lease",
        lease_until: mockNowMs + 60_000,
      })
      .execute();

    const didWork = await processNextInboxItem(deps);

    expect(didWork).toBe(false);
    expect(analyzeMessageMock).not.toHaveBeenCalled();
  });

  it("picks up items if their lease has expired", async () => {
    await saveToInbox(deps, validPayload);
    await db
      .updateTable("inbox")
      .set({
        lease_token: "expired-lease",
        lease_until: mockNowMs - 1_000,
      })
      .execute();
    analyzeMessageMock.mockResolvedValue(expenseAnalysis);
    persistAnalyzedMessageMock.mockResolvedValue({
      kind: "success",
      message: "Expired lease processed",
    });

    const didWork = await processNextInboxItem(deps);

    expect(didWork).toBe(true);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("confirmed");
  });
});
