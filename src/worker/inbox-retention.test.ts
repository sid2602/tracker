import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../db/schema.js";
import { createTestDatabase, createTestDeps } from "../test/fixtures.js";
import {
  cleanupExpiredInbox,
  INBOX_RETENTION_BATCH_SIZE,
  INBOX_RETENTION_MS,
  runInboxRetention,
} from "./inbox/retention.js";
import type { AppDeps } from "./types.js";

describe("inbox retention", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;
  const nowMs = 1_700_000_000_000;

  beforeEach(async () => {
    db = await createTestDatabase();
    deps = createTestDeps(db, {
      now: () => new Date(nowMs),
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("removes only terminal records older than ninety days", async () => {
    const old = nowMs - INBOX_RETENTION_MS - 1;
    const fresh = nowMs - INBOX_RETENTION_MS + 1;
    await insertInboxRows([
      ["old-confirmed", "confirmed", old],
      ["old-ignored", "ignored", old],
      ["old-failed", "failed", old],
      ["fresh-confirmed", "confirmed", fresh],
      ["old-pending", "pending", old],
      ["old-analyzed", "analyzed", old],
      ["old-saved", "saved", old],
    ]);

    await expect(cleanupExpiredInbox(deps)).resolves.toBe(3);

    const remaining = await db
      .selectFrom("inbox")
      .select(["message_key", "status"])
      .orderBy("receive_sequence", "asc")
      .execute();
    expect(remaining).toEqual([
      { message_key: "fresh-confirmed", status: "confirmed" },
      { message_key: "old-pending", status: "pending" },
      { message_key: "old-analyzed", status: "analyzed" },
      { message_key: "old-saved", status: "saved" },
    ]);
  });

  it("deletes terminal rows in bounded, repeatable batches", async () => {
    const old = nowMs - INBOX_RETENTION_MS - 1;
    const rowCount = INBOX_RETENTION_BATCH_SIZE * 2 + 1;
    await insertInboxRows(
      Array.from({ length: rowCount }, (_, index) => [
        `old-${index}`,
        "failed",
        old,
      ]),
    );

    await expect(cleanupExpiredInbox(deps)).resolves.toBe(rowCount);
    await expect(cleanupExpiredInbox(deps)).resolves.toBe(0);
    await expect(
      db.selectFrom("inbox").select("message_key").execute(),
    ).resolves.toHaveLength(0);
  });

  it("does not start cleanup after shutdown has begun", async () => {
    const old = nowMs - INBOX_RETENTION_MS - 1;
    await insertInboxRows([["old-failed", "failed", old]]);
    const controller = new AbortController();
    controller.abort();

    await expect(
      runInboxRetention(deps, controller.signal),
    ).resolves.toBeUndefined();

    await expect(
      db.selectFrom("inbox").select("message_key").execute(),
    ).resolves.toHaveLength(1);
  });

  async function insertInboxRows(
    rows: Array<[string, "confirmed" | "ignored" | "failed" | "pending" | "analyzed" | "saved", number]>,
  ): Promise<void> {
    await db
      .insertInto("inbox")
      .values(
        rows.map(([messageKey, status, receivedAt], index) => ({
          message_key: messageKey,
          receive_sequence: index + 1,
          raw_envelope: "{}",
          status,
          attempts: 0,
          received_at: receivedAt,
        })),
      )
      .execute();
  }
});
