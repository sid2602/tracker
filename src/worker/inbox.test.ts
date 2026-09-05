import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveToInbox, processNextInboxItem } from "./inbox.js";
import { openDatabase, initSchema } from "../db/connection.js";
import type { AppDeps } from "./types.js";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../db/schema.js";

const processMessageMock = vi.fn();
const sendMessageMock = vi.fn();

vi.mock("./dispatch.js", () => ({
  processMessage: (...args: unknown[]) => processMessageMock(...args),
}));

vi.mock("../signal/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../signal/index.js")>();
  return {
    ...actual,
    sendMessage: (...args: unknown[]) => sendMessageMock(...args),
  };
});

vi.mock("../tracing.js", () => ({
  withMessageTrace: async (attrs: unknown, cb: () => Promise<void>) => cb(),
}));

// Mock logger to avoid noise
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
    mockNowMs = 1000000;
    
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
      timestamp: 1700000000000,
      dataMessage: {
        message: "test message",
      },
    },
  };

  it("saves a valid message to the inbox", async () => {
    await saveToInbox(deps, validPayload);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items).toHaveLength(1);
    expect(items[0].message_key).toBe("+15005550100-1-1700000000000");
    expect(items[0].status).toBe("pending");
    expect(items[0].received_at).toBe(mockNowMs);
  });

  it("processes a pending item successfully and confirms it", async () => {
    await saveToInbox(deps, validPayload);

    processMessageMock.mockResolvedValue({
      kind: "success",
      message: "Expense saved",
    });

    const didWork = await processNextInboxItem(deps);
    expect(didWork).toBe(true);

    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledWith(
      deps.config,
      "+15005550100",
      "Expense saved"
    );

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items[0].status).toBe("confirmed");
    expect(items[0].response_text).toBe("Expense saved");
    expect(items[0].lease_token).toBeNull();
    expect(items[0].lease_until).toBeNull();
  });

  it("ignores message when processMessage returns silent", async () => {
    await saveToInbox(deps, validPayload);

    processMessageMock.mockResolvedValue({
      kind: "silent",
    });

    const didWork = await processNextInboxItem(deps);
    expect(didWork).toBe(true);

    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).not.toHaveBeenCalled();

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items[0].status).toBe("ignored");
    expect(items[0].lease_token).toBeNull();
    expect(items[0].lease_until).toBeNull();
  });

  it("schedules a retry with exponential backoff if processing fails", async () => {
    await saveToInbox(deps, validPayload);

    processMessageMock.mockRejectedValue(new Error("AI Gateway Error"));

    const didWork = await processNextInboxItem(deps);
    expect(didWork).toBe(true);

    expect(sendMessageMock).not.toHaveBeenCalled();

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items[0].status).toBe("pending");
    expect(items[0].attempts).toBe(1);
    expect(items[0].lease_token).toBeNull();
    expect(items[0].lease_until).toBeNull();
    
    // backoff is Math.pow(2, attempts) * 15000 = 2^1 * 15000 = 30000
    expect(items[0].next_attempt_at).toBe(mockNowMs + 30000);
  });

  it("does not pick up items that have an active lease", async () => {
    await saveToInbox(deps, validPayload);

    // Manually lease the item in the future
    await db.updateTable("inbox")
      .set({
        lease_token: "active-lease",
        lease_until: mockNowMs + 60000,
      })
      .execute();

    const didWork = await processNextInboxItem(deps);
    // Since the only item is leased, it should find nothing to do
    expect(didWork).toBe(false);
    expect(processMessageMock).not.toHaveBeenCalled();
  });

  it("picks up items if their lease has expired", async () => {
    await saveToInbox(deps, validPayload);

    // Manually lease the item in the past
    await db.updateTable("inbox")
      .set({
        lease_token: "expired-lease",
        lease_until: mockNowMs - 1000,
      })
      .execute();

    processMessageMock.mockResolvedValue({
      kind: "success",
      message: "Expired lease processed",
    });

    const didWork = await processNextInboxItem(deps);
    expect(didWork).toBe(true);
    expect(processMessageMock).toHaveBeenCalledTimes(1);
    expect(sendMessageMock).toHaveBeenCalledTimes(1);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items[0].status).toBe("confirmed");
  });
});
