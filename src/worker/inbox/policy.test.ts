import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import {
  createTestConfig,
  createTestDatabase,
  createTestDeps,
} from "../../test/fixtures.js";
import type { AppDeps } from "../types.js";
import {
  claimNextInboxItem,
  markIgnored,
  saveUserFailure,
  scheduleRetry,
} from "./policy.js";

const loggerMock = vi.hoisted(() => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: loggerMock,
}));

const config = createTestConfig();

describe("inbox policy", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;

  beforeEach(async () => {
    vi.clearAllMocks();
    db = await createTestDatabase("base");
    deps = createTestDeps(db, {
      config,
      now: () => new Date(1_000_000),
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("claims the FIFO head and invokes the claim hook before leasing", async () => {
    await insertItem("first");
    const beforeClaim = vi.fn(async () => undefined);

    const result = await claimNextInboxItem(db, 1_000, { beforeClaim });

    expect(beforeClaim).toHaveBeenCalledWith("first");
    expect(result.kind).toBe("claimed");
    if (result.kind === "claimed") {
      expect(result.item.message_key).toBe("first");
      expect(result.item.lease_token).toBe(result.leaseToken);
    }
  });

  it("returns none while the FIFO head is leased or delayed", async () => {
    await insertItem("first");
    await db
      .updateTable("inbox")
      .set({ lease_until: 2_000 })
      .where("message_key", "=", "first")
      .execute();

    await expect(claimNextInboxItem(db, 1_000)).resolves.toEqual({
      kind: "none",
    });
  });

  it("moves an exhausted head to failed", async () => {
    await insertItem("failed-candidate", "pending", 5);

    await expect(claimNextInboxItem(db, 1_000)).resolves.toEqual({
      kind: "exhausted",
    });
    await expect(
      db
        .selectFrom("inbox")
        .select(["status", "failed_at", "lease_token", "lease_until"])
        .where("message_key", "=", "failed-candidate")
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      status: "failed",
      failed_at: 1_000,
      lease_token: null,
      lease_until: null,
    });
  });

  it("marks a leased analysis as ignored", async () => {
    await insertItem("ignore-me");
    await setLease("ignore-me", "lease-1");

    await markIgnored(deps, "ignore-me", "lease-1", {
      version: 1,
      intent: "ignore",
    });

    await expect(
      db
        .selectFrom("inbox")
        .select(["status", "parsed_json", "lease_token"])
        .where("message_key", "=", "ignore-me")
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      status: "ignored",
      parsed_json: '{"version":1,"intent":"ignore"}',
      lease_token: null,
    });
  });

  it("saves user feedback without changing the retry counter", async () => {
    await insertItem("feedback");
    await db
      .updateTable("inbox")
      .set({ status: "analyzed", lease_token: "lease-2" })
      .where("message_key", "=", "feedback")
      .execute();

    await expect(
      saveUserFailure(deps, "feedback", "lease-2", "analyzed", "Please retry"),
    ).resolves.toBe("Please retry");
    await expect(
      db
        .selectFrom("inbox")
        .select(["status", "response_text", "attempts"])
        .where("message_key", "=", "feedback")
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      status: "saved",
      response_text: "Please retry",
      attempts: 0,
    });
  });

  it("schedules retry with exponential backoff and records terminal failure", async () => {
    await insertItem("retry");
    await setLease("retry", "lease-3");
    const retryItem = await db
      .selectFrom("inbox")
      .select(["message_key", "attempts"])
      .where("message_key", "=", "retry")
      .executeTakeFirstOrThrow();

    await scheduleRetry(
      deps,
      retryItem,
      "pending",
      "lease-3",
      new Error("temporary"),
    );

    await expect(
      db
        .selectFrom("inbox")
        .select(["status", "attempts", "next_attempt_at", "last_error"])
        .where("message_key", "=", "retry")
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      status: "pending",
      attempts: 1,
      next_attempt_at: 1_030_000,
      last_error: "temporary",
    });

    await insertItem("terminal", "analyzed", 4);
    await setLease("terminal", "lease-4");
    const terminalItem = await db
      .selectFrom("inbox")
      .select(["message_key", "attempts"])
      .where("message_key", "=", "terminal")
      .executeTakeFirstOrThrow();

    await scheduleRetry(
      deps,
      terminalItem,
      "analyzed",
      "lease-4",
      new Error("permanent"),
    );

    await expect(
      db
        .selectFrom("inbox")
        .select(["status", "attempts", "next_attempt_at", "failed_at"])
        .where("message_key", "=", "terminal")
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      status: "failed",
      attempts: 5,
      next_attempt_at: null,
      failed_at: 1_000_000,
    });
  });

  async function insertItem(
    messageKey: string,
    status: "pending" | "analyzed" | "saved" = "pending",
    attempts = 0,
  ): Promise<void> {
    await db
      .insertInto("inbox")
      .values({
        message_key: messageKey,
        receive_sequence: (
          await db
            .selectFrom("inbox")
            .select(({ fn }) => fn.count<number>("message_key").as("count"))
            .executeTakeFirstOrThrow()
        ).count + 1,
        raw_envelope: "{}",
        status,
        attempts,
        received_at: 1,
      })
      .execute();
  }

  async function setLease(messageKey: string, leaseToken: string): Promise<void> {
    await db
      .updateTable("inbox")
      .set({ lease_token: leaseToken, lease_until: null })
      .where("message_key", "=", messageKey)
      .execute();
  }
});
