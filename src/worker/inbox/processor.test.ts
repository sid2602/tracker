import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import {
  createTestConfig,
  createTestDatabase,
  createTestDeps,
} from "../../test/fixtures.js";
import type { MessageAnalysis } from "../analysis.js";
import type { AppDeps, HandlerResult, MessageContext } from "../types.js";
import { processNextInboxItem } from "./processor.js";

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

vi.mock("../dispatch.js", () => ({
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

vi.mock("../../signal/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../signal/index.js")>();
  return {
    ...actual,
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  };
});

vi.mock("../../tracing.js", () => ({
  withMessageTrace: async (
    _attributes: unknown,
    callback: () => Promise<void>,
  ) => callback(),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const config = createTestConfig();

describe("inbox processor", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;
  const rawEnvelope = JSON.stringify({
    envelope: {
      source: "+15005550100",
      sourceDevice: 1,
      timestamp: 100,
      dataMessage: { message: "coffee 15 pln" },
    },
  });
  const context: MessageContext = {
    messageKey: "+15005550100-1-100",
    sourceAuthor: "+15005550100",
    sourceTimestamp: 100,
    rawText: "coffee 15 pln",
  };
  const expenseAnalysis: MessageAnalysis = {
    version: 1,
    intent: "expenses.create",
    parsed: {
      items: [
        {
          amountCents: 1500,
          currency: "PLN",
          category: "food",
          occurredOn: "2026-09-12",
          note: "coffee",
        },
      ],
    },
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    sendMessageMock.mockResolvedValue(undefined);
    db = await createTestDatabase("base");
    deps = createTestDeps(db, {
      config,
      now: () => new Date(1_000_000),
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("analyzes, persists, delivers, and confirms a pending item", async () => {
    analyzeMessageMock.mockResolvedValue(expenseAnalysis);
    persistAnalyzedMessageMock.mockResolvedValue({
      kind: "success",
      message: "Saved 1 item",
      insertedCount: 1,
    });
    await insertInboxItem("pending", null);

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    expect(analyzeMessageMock).toHaveBeenCalledWith(deps, context);
    expect(persistAnalyzedMessageMock).toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(
      config,
      context.sourceAuthor,
      "Saved 1 item",
    );
    await expect(
      db
        .selectFrom("inbox")
        .select(["status", "response_text"])
        .where("message_key", "=", context.messageKey)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      status: "confirmed",
      response_text: "Saved 1 item",
    });
  });

  it("delivers a previously saved item without re-analyzing it", async () => {
    await insertInboxItem("saved", "Saved earlier");

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    expect(analyzeMessageMock).not.toHaveBeenCalled();
    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).toHaveBeenCalledWith(
      config,
      context.sourceAuthor,
      "Saved earlier",
    );
  });

  it("marks ignored analysis without persisting or delivering", async () => {
    analyzeMessageMock.mockResolvedValue({
      version: 1,
      intent: "ignore",
    });
    await insertInboxItem("pending", null);

    await expect(processNextInboxItem(deps)).resolves.toBe(true);

    expect(persistAnalyzedMessageMock).not.toHaveBeenCalled();
    expect(sendMessageMock).not.toHaveBeenCalled();
    await expect(
      db
        .selectFrom("inbox")
        .select("status")
        .where("message_key", "=", context.messageKey)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({ status: "ignored" });
  });

  async function insertInboxItem(
    status: "pending" | "saved",
    responseText: string | null,
  ): Promise<void> {
    await db
      .insertInto("inbox")
      .values({
        message_key: context.messageKey,
        receive_sequence: 1,
        raw_envelope: rawEnvelope,
        status,
        response_text: responseText,
        attempts: 0,
        received_at: 1,
      })
      .execute();
  }
});
