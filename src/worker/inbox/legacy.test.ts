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
  deserializeStoredMessage,
  handleHistoricalSelfEcho,
  handleHistoricalUnauthorized,
  quarantineHistoricalMessage,
} from "./legacy.js";

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const config = createTestConfig();

describe("legacy inbox handling", () => {
  let db: Kysely<AppDatabase>;
  let deps: AppDeps;

  beforeEach(async () => {
    db = await createTestDatabase("base");
    deps = createTestDeps(db, {
      config,
      now: () => new Date(1_000_000),
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  it("deserializes inbound, self-echo, unauthorized, and invalid payloads", () => {
    expect(
      deserializeStoredMessage(
        JSON.stringify({
          envelope: {
            source: "+15005550100",
            sourceDevice: 1,
            timestamp: 100,
            dataMessage: { message: "coffee 10 pln" },
          },
        }),
        {
          selfNumber: "+15005550100",
          allowedInputDeviceIds: [1],
        },
      ),
    ).toEqual({
      kind: "inbound",
      context: {
        messageKey: "+15005550100-1-100",
        sourceAuthor: "+15005550100",
        sourceTimestamp: 100,
        rawText: "coffee 10 pln",
      },
    });

    expect(
      deserializeStoredMessage(
        JSON.stringify({
          envelope: {
            source: "+15005550100",
            sourceDevice: 2,
            timestamp: 101,
            dataMessage: { message: "Saved 1 item" },
          },
        }),
        {
          selfNumber: "+15005550100",
          allowedInputDeviceIds: [1],
        },
      ),
    ).toEqual({ kind: "self_echo" });

    expect(
      deserializeStoredMessage(
        JSON.stringify({
          envelope: {
            source: "+48111111111",
            sourceDevice: 1,
            timestamp: 102,
            dataMessage: { message: "foreign command" },
          },
        }),
        {
          selfNumber: "+15005550100",
          allowedInputDeviceIds: [1],
        },
      ),
    ).toEqual({ kind: "unauthorized" });

    expect(
      deserializeStoredMessage("{not-json", {
        selfNumber: "+15005550100",
        allowedInputDeviceIds: [1],
      }),
    ).toEqual({ kind: "invalid" });
  });

  it("classifies legacy context payloads by source device", () => {
    const context = {
      messageKey: "+15005550100-2-200",
      sourceAuthor: "+15005550100",
      sourceTimestamp: 200,
      rawText: "legacy command",
    };

    expect(
      deserializeStoredMessage(JSON.stringify(context), {
        selfNumber: "+15005550100",
        allowedInputDeviceIds: [2],
      }),
    ).toEqual({ kind: "inbound", context });
    expect(
      deserializeStoredMessage(JSON.stringify(context), {
        selfNumber: "+15005550100",
        allowedInputDeviceIds: [1],
      }),
    ).toEqual({ kind: "self_echo" });
    expect(
      deserializeStoredMessage(
        JSON.stringify({ ...context, messageKey: "legacy-key" }),
        {
          selfNumber: "+15005550100",
          allowedInputDeviceIds: [1],
        },
      ),
    ).toEqual({ kind: "quarantine" });
  });

  it("transitions historical records to ignored or failed terminal states", async () => {
    await insertRecord("self-echo", "pending", "lease-self");
    const selfEcho = await getRecord("self-echo");
    await handleHistoricalSelfEcho(deps, selfEcho, "lease-self");

    await insertRecord("unauthorized", "saved", "lease-unauthorized");
    const unauthorized = await getRecord("unauthorized");
    await handleHistoricalUnauthorized(deps, unauthorized, "lease-unauthorized");

    await insertRecord("quarantine", "analyzed", "lease-quarantine");
    const quarantine = await getRecord("quarantine");
    await quarantineHistoricalMessage(deps, quarantine, "lease-quarantine");

    await expect(
      db
        .selectFrom("inbox")
        .select(["message_key", "status", "last_error"])
        .orderBy("message_key", "asc")
        .execute(),
    ).resolves.toEqual([
      {
        message_key: "quarantine",
        status: "failed",
        last_error: "legacy_self_account_device_unknown",
      },
      {
        message_key: "self-echo",
        status: "ignored",
        last_error: "self_echo_ignored",
      },
      {
        message_key: "unauthorized",
        status: "failed",
        last_error: "unauthorized_requires_manual_review",
      },
    ]);
  });

  async function insertRecord(
    messageKey: string,
    status: "pending" | "analyzed" | "saved",
    leaseToken: string,
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
        parsed_json: null,
        response_text: status === "saved" ? "stored response" : null,
        attempts: 0,
        lease_token: leaseToken,
        received_at: 1,
      })
      .execute();
  }

  async function getRecord(
    messageKey: string,
  ): Promise<{
    message_key: string;
    status: AppDatabase["inbox"]["status"];
    lease_token: string | null;
  }> {
    return db
      .selectFrom("inbox")
      .select(["message_key", "status", "lease_token"])
      .where("message_key", "=", messageKey)
      .executeTakeFirstOrThrow();
  }
});
