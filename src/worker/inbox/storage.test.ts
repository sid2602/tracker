import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import {
  createTestConfig,
  createTestDatabase,
  createTestDeps,
} from "../../test/fixtures.js";
import type { AppDeps, MessageContext } from "../types.js";
import {
  claimInboxItem,
  insertInboxRecord,
  selectClaimedInboxItem,
  selectInboxHead,
} from "./storage.js";

const config = createTestConfig();

describe("inbox storage", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;

  beforeEach(async () => {
    db = await createTestDatabase("base");
    deps = createTestDeps(db, { config });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("inserts inbound records in sequence and ignores duplicate message keys", async () => {
    const first = context("first");
    const second = context("second");

    await insertInboxRecord(deps, first, '{"message":"first"}', 100);
    await insertInboxRecord(deps, first, '{"message":"duplicate"}', 101);
    await insertInboxRecord(deps, second, '{"message":"second"}', 102);

    await expect(
      db
        .selectFrom("inbox")
        .select(["message_key", "receive_sequence", "raw_envelope"])
        .orderBy("receive_sequence", "asc")
        .execute(),
    ).resolves.toEqual([
      {
        message_key: "first",
        receive_sequence: 1,
        raw_envelope: '{"message":"first"}',
      },
      {
        message_key: "second",
        receive_sequence: 2,
        raw_envelope: '{"message":"second"}',
      },
    ]);
  });

  it("selects and leases the FIFO head until its lease expires", async () => {
    await insertInboxRecord(deps, context("first"), "{}", 100);
    await insertInboxRecord(deps, context("second"), "{}", 101);

    await expect(selectInboxHead(db, ["pending"])).resolves.toMatchObject({
      message_key: "first",
      attempts: 0,
    });
    await expect(
      claimInboxItem(db, "first", "lease-1", 1_000, 100, 5, ["pending"]),
    ).resolves.toBe(true);
    await expect(
      selectClaimedInboxItem(db, "first", "lease-1"),
    ).resolves.toMatchObject({
      message_key: "first",
      lease_token: "lease-1",
      lease_until: 1_000,
    });
    await expect(
      claimInboxItem(db, "first", "lease-2", 2_000, 100, 5, ["pending"]),
    ).resolves.toBe(false);
  });

  function context(messageKey: string): MessageContext {
    return {
      messageKey,
      sourceAuthor: "+15005550100",
      sourceTimestamp: messageKey === "first" ? 1 : 2,
      rawText: messageKey,
    };
  }
});
