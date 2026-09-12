import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import {
  createTestConfig,
  createTestDatabase,
  createTestDeps,
} from "../../test/fixtures.js";
import type { AppDeps, MessageContext } from "../types.js";
import { deliverSavedItem } from "./delivery.js";

const sendMessageMock = vi.fn();

vi.mock("../../signal/index.js", () => ({
  sendMessage: (...args: unknown[]) => sendMessageMock(...args),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const config = createTestConfig();

describe("inbox delivery", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;
  const context: MessageContext = {
    messageKey: "message-1",
    sourceAuthor: "+15005550100",
    sourceTimestamp: 100,
    rawText: "coffee 10 pln",
  };

  beforeEach(async () => {
    sendMessageMock.mockReset();
    sendMessageMock.mockResolvedValue(undefined);
    db = await createTestDatabase("base");
    deps = createTestDeps(db, { config });
    await db
      .insertInto("inbox")
      .values({
        message_key: context.messageKey,
        receive_sequence: 1,
        raw_envelope: "{}",
        status: "saved",
        response_text: "Saved 1 item",
        attempts: 0,
        lease_token: "lease-1",
        received_at: 1,
      })
      .execute();
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("sends the saved response and confirms the inbox record", async () => {
    await deliverSavedItem(
      deps,
      context.messageKey,
      context,
      "Saved 1 item",
      "lease-1",
    );

    expect(sendMessageMock).toHaveBeenCalledWith(
      config,
      context.sourceAuthor,
      "Saved 1 item",
    );
    await expect(
      db
        .selectFrom("inbox")
        .select(["status", "lease_token", "lease_until"])
        .where("message_key", "=", context.messageKey)
        .executeTakeFirstOrThrow(),
    ).resolves.toEqual({
      status: "confirmed",
      lease_token: null,
      lease_until: null,
    });
  });

  it("rejects a saved record without response text before sending", async () => {
    await expect(
      deliverSavedItem(deps, context.messageKey, context, null, "lease-1"),
    ).rejects.toThrow("Saved inbox item has no response text");
    expect(sendMessageMock).not.toHaveBeenCalled();
  });
});
