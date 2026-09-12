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
        signalPhoneNumber: "+15005550100",
        signalAllowedInputDeviceIds: [1],
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

  const secondValidPayload = {
    envelope: {
      source: "+15005550100",
      sourceDevice: 1,
      timestamp: 1_700_000_000_004,
      dataMessage: {
        message: "second test message",
      },
    },
  };

  const unauthorizedPayload = {
    envelope: {
      source: "+48111111111",
      sourceDevice: 1,
      timestamp: 1_700_000_000_003,
      dataMessage: {
        message: "foreign command",
      },
    },
  };

  const selfEchoPayload = {
    envelope: {
      source: "+15005550100",
      sourceDevice: 2,
      timestamp: 1_700_000_000_001,
      syncMessage: {
        sentMessage: {
          destinationNumber: "+15005550100",
          timestamp: 1_700_000_000_001,
          message: "Saved 1 item",
        },
      },
    },
  };

  const selfChatPayload = {
    envelope: {
      source: "+15005550100",
      sourceDevice: 1,
      timestamp: 1_700_000_000_002,
      syncMessage: {
        sentMessage: {
          destinationNumber: "+15005550100",
          timestamp: 1_700_000_000_002,
          message: "cocoa 10 pln",
        },
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

  async function insertLegacySelfEcho(
    status: "pending" | "analyzed" | "saved",
  ): Promise<void> {
    const sourceTimestamp = 1_700_000_000_010;
    const context = {
      messageKey: `+15005550100-2-${sourceTimestamp}`,
      sourceAuthor: "+15005550100",
      sourceTimestamp,
      rawText: "Saved 1 item",
    };

    await db
      .insertInto("inbox")
      .values({
        message_key: context.messageKey,
        receive_sequence: 1,
        raw_envelope: JSON.stringify(context),
        status,
        parsed_json: status === "pending" ? null : JSON.stringify(expenseAnalysis),
        response_text: status === "saved" ? "Already saved" : null,
        attempts: 0,
        received_at: mockNowMs,
      })
      .execute();
  }

  async function insertHistoricalUnauthorized(
    status: "pending" | "analyzed" | "saved",
  ): Promise<void> {
    await db
      .insertInto("inbox")
      .values({
        message_key: "+48111111111-1-1700000000003",
        receive_sequence: 1,
        raw_envelope: JSON.stringify(unauthorizedPayload),
        status,
        parsed_json: status === "pending" ? null : JSON.stringify(expenseAnalysis),
        response_text: status === "saved" ? "Do not deliver" : null,
        attempts: 0,
        received_at: mockNowMs,
      })
      .execute();
  }

  async function insertLegacyUnauthorized(
    status: "pending" | "analyzed" | "saved",
  ): Promise<void> {
    const legacyContext = {
      messageKey: "+48111111111-1-1700000000003",
      sourceAuthor: "+48111111111",
      sourceTimestamp: 1_700_000_000_003,
      rawText: "foreign legacy command",
    };

    await db
      .insertInto("inbox")
      .values({
        message_key: legacyContext.messageKey,
        receive_sequence: 1,
        raw_envelope: JSON.stringify(legacyContext),
        status,
        parsed_json: status === "pending" ? null : JSON.stringify(expenseAnalysis),
        response_text: status === "saved" ? "Do not deliver" : null,
        attempts: 0,
        received_at: mockNowMs,
      })
      .execute();
  }

  it("saves the original payload to the inbox", async () => {
    await saveToInbox(deps, validPayload);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items).toHaveLength(1);
    expect(items[0]?.message_key).toBe("+15005550100-1-1700000000000");
    expect(items[0]?.status).toBe("pending");
    expect(items[0]?.raw_envelope).toBe(JSON.stringify(validPayload));
    expect(items[0]?.received_at).toBe(mockNowMs);
  });

  it("allocates durable receive sequences and scopes duplicates to message keys", async () => {
    await saveToInbox(deps, validPayload);
    await saveToInbox(deps, secondValidPayload);
    await saveToInbox(deps, validPayload);

    const items = await db
      .selectFrom("inbox")
      .select(["message_key", "receive_sequence"])
      .orderBy("receive_sequence", "asc")
      .execute();
    expect(items).toEqual([
      {
        message_key: "+15005550100-1-1700000000000",
        receive_sequence: 1,
      },
      {
        message_key: "+15005550100-1-1700000000004",
        receive_sequence: 2,
      },
    ]);
  });

  it("does not let a newer ready item overtake an older retrying head", async () => {
    await saveToInbox(deps, validPayload);
    await saveToInbox(deps, secondValidPayload);
    await db
      .updateTable("inbox")
      .set({ next_attempt_at: mockNowMs + 60_000 })
      .where("message_key", "=", "+15005550100-1-1700000000000")
      .execute();

    await expect(processNextInboxItem(deps)).resolves.toBe(false);
    expect(analyzeMessageMock).not.toHaveBeenCalled();
  });

  it("quarantines an exhausted non-terminal head before newer work", async () => {
    await saveToInbox(deps, validPayload);
    await saveToInbox(deps, secondValidPayload);
    await db
      .updateTable("inbox")
      .set({ attempts: 5 })
      .where("message_key", "=", "+15005550100-1-1700000000000")
      .execute();

    await expect(processNextInboxItem(deps)).resolves.toBe(true);
    expect(analyzeMessageMock).not.toHaveBeenCalled();

    const head = await db
      .selectFrom("inbox")
      .select(["status", "failed_at"])
      .where("message_key", "=", "+15005550100-1-1700000000000")
      .executeTakeFirstOrThrow();
    expect(head.status).toBe("failed");
    expect(head.failed_at).toBe(mockNowMs);
  });

  it("does not persist a regular dataMessage from another Signal account", async () => {
    await saveToInbox(deps, unauthorizedPayload);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items).toHaveLength(0);
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("ignores a historical pending unauthorized message without processing it", async () => {
    await insertHistoricalUnauthorized("pending");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.parsed_json).toBe(JSON.stringify({ version: 1, intent: "ignore" }));
    expect(item.last_error).toBe("unauthorized_author_ignored");
    expect(item.lease_token).toBeNull();
    expect(item.lease_until).toBeNull();
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("ignores a historical analyzed unauthorized message without processing it", async () => {
    await insertHistoricalUnauthorized("analyzed");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.last_error).toBe("unauthorized_author_ignored");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("quarantines a historical saved unauthorized message without sending it", async () => {
    await insertHistoricalUnauthorized("saved");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("failed");
    expect(item.last_error).toBe("unauthorized_requires_manual_review");
    expect(item.failed_at).toBe(mockNowMs);
    expect(item.response_text).toBe("Do not deliver");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("does not persist a new sync sentMessage self-echo", async () => {
    await saveToInbox(deps, selfEchoPayload);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items).toHaveLength(0);
    expect(analyzeMessageMock).not.toHaveBeenCalled();
  });

  it("persists self-chat input from the user device", async () => {
    await saveToInbox(deps, selfChatPayload);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items).toHaveLength(1);
    expect(items[0]?.message_key).toBe("+15005550100-1-1700000000002");
    expect(items[0]?.raw_envelope).toBe(JSON.stringify(selfChatPayload));
  });

  it("marks a historical pending self-echo as ignored without processing it", async () => {
    await db
      .insertInto("inbox")
      .values({
        message_key: "+15005550100-1-1700000000001",
        receive_sequence: 1,
        raw_envelope: JSON.stringify(selfEchoPayload),
        status: "pending",
        attempts: 0,
        received_at: mockNowMs,
      })
      .execute();

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.parsed_json).toBe(JSON.stringify({ version: 1, intent: "ignore" }));
    expect(item.last_error).toBe("self_echo_ignored");
    expect(item.lease_token).toBeNull();
    expect(item.lease_until).toBeNull();
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("marks a historical analyzed self-echo as ignored without processing it", async () => {
    await db
      .insertInto("inbox")
      .values({
        message_key: "+15005550100-1-1700000000001",
        receive_sequence: 1,
        raw_envelope: JSON.stringify(selfEchoPayload),
        status: "analyzed",
        parsed_json: JSON.stringify(expenseAnalysis),
        attempts: 1,
        received_at: mockNowMs,
      })
      .execute();

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.parsed_json).toBe(JSON.stringify({ version: 1, intent: "ignore" }));
    expect(item.last_error).toBe("self_echo_ignored");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("quarantines a historical saved self-echo without replaying its effect", async () => {
    await db
      .insertInto("inbox")
      .values({
        message_key: "+15005550100-1-1700000000001",
        receive_sequence: 1,
        raw_envelope: JSON.stringify(selfEchoPayload),
        status: "saved",
        parsed_json: JSON.stringify(expenseAnalysis),
        response_text: "Already saved",
        attempts: 2,
        received_at: mockNowMs,
      })
      .execute();

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("failed");
    expect(item.last_error).toBe("self_echo_requires_manual_review");
    expect(item.failed_at).toBe(mockNowMs);
    expect(item.parsed_json).toBe(JSON.stringify(expenseAnalysis));
    expect(item.response_text).toBe("Already saved");
    expect(item.attempts).toBe(2);
    expect(item.lease_token).toBeNull();
    expect(item.lease_until).toBeNull();
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("ignores a legacy normalized pending self-echo", async () => {
    await insertLegacySelfEcho("pending");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.last_error).toBe("self_echo_ignored");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("ignores a legacy normalized analyzed self-echo", async () => {
    await insertLegacySelfEcho("analyzed");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.last_error).toBe("self_echo_ignored");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("quarantines a legacy normalized saved self-echo", async () => {
    await insertLegacySelfEcho("saved");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("failed");
    expect(item.last_error).toBe("self_echo_requires_manual_review");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("ignores a legacy normalized unauthorized message", async () => {
    await insertLegacyUnauthorized("pending");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.last_error).toBe("unauthorized_author_ignored");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("ignores an analyzed legacy normalized unauthorized message", async () => {
    await insertLegacyUnauthorized("analyzed");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("ignored");
    expect(item.last_error).toBe("unauthorized_author_ignored");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("quarantines a saved legacy normalized unauthorized message", async () => {
    await insertLegacyUnauthorized("saved");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("failed");
    expect(item.last_error).toBe("unauthorized_requires_manual_review");
    expect(item.failed_at).toBe(mockNowMs);
    expect(item.response_text).toBe("Do not deliver");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("quarantines an unparseable legacy self-account payload", async () => {
    const legacyContext = {
      messageKey: "legacy-message",
      sourceAuthor: "+15005550100",
      sourceTimestamp: 1_700_000_000_011,
      rawText: "unknown legacy message",
    };
    await db
      .insertInto("inbox")
      .values({
        message_key: legacyContext.messageKey,
        receive_sequence: 1,
        raw_envelope: JSON.stringify(legacyContext),
        status: "pending",
        attempts: 0,
        received_at: mockNowMs,
      })
      .execute();

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("failed");
    expect(item.last_error).toBe("legacy_self_account_device_unknown");
    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
  });

  it("replays legacy normalized inbox payloads after envelope classification", async () => {
    const legacyContext = {
      messageKey: "+15005550100-1-1700000000002",
      sourceAuthor: "+15005550100",
      sourceTimestamp: 1_700_000_000_002,
      rawText: "legacy expense",
    };
    await db
      .insertInto("inbox")
      .values({
        message_key: legacyContext.messageKey,
        receive_sequence: 1,
        raw_envelope: JSON.stringify(legacyContext),
        status: "pending",
        attempts: 0,
        received_at: mockNowMs,
      })
      .execute();
    analyzeMessageMock.mockResolvedValue(expenseAnalysis);
    persistAnalyzedMessageMock.mockResolvedValue({
      kind: "success",
      message: "Legacy saved",
    });

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    const item = await db.selectFrom("inbox").selectAll().executeTakeFirstOrThrow();
    expect(item.status).toBe("confirmed");
    expect(sendMessageMock).toHaveBeenCalledWith(
      deps.config,
      legacyContext.sourceAuthor,
      "Legacy saved",
    );
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

  it("allows only one concurrent processor to claim an item", async () => {
    await saveToInbox(deps, validPayload);

    let selectedProcessors = 0;
    let markBothSelected: (() => void) | undefined;
    let releaseClaims: (() => void) | undefined;
    const bothSelected = new Promise<void>((resolve) => {
      markBothSelected = resolve;
    });
    const claimsReleased = new Promise<void>((resolve) => {
      releaseClaims = resolve;
    });
    const beforeClaim = async () => {
      selectedProcessors += 1;
      if (selectedProcessors === 2) {
        markBothSelected?.();
      }
      await claimsReleased;
    };
    analyzeMessageMock.mockResolvedValue(expenseAnalysis);
    persistAnalyzedMessageMock.mockResolvedValue({
      kind: "success",
      message: "Only once",
    });

    const firstProcessor = processNextInboxItem(deps, { beforeClaim });
    const secondProcessor = processNextInboxItem(deps, { beforeClaim });
    await bothSelected;

    if (!releaseClaims) {
      throw new Error("Claim release callback was not initialized");
    }
    releaseClaims();
    const results = await Promise.all([firstProcessor, secondProcessor]);
    expect(results.filter((result) => result)).toHaveLength(1);
    expect(analyzeMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
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
