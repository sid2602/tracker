import { describe, expect, it, vi } from "vitest";
import { saveToInbox, processNextInboxItem } from "./inbox.js";
import { openDatabase, initSchema } from "../db/connection.js";
import type { AppDeps } from "./types.js";

describe("inbox", () => {
  it("saves a valid message to the inbox", async () => {
    const db = openDatabase(":memory:");
    await initSchema(db);

    const deps: AppDeps = {
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
      now: () => new Date(1000),
    };

    const payload = {
      envelope: {
        source: "+15005550100",
        sourceDevice: 1,
        timestamp: 1700000000000,
        dataMessage: {
          message: "test message",
        },
      },
    };

    await saveToInbox(deps, payload);

    const items = await db.selectFrom("inbox").selectAll().execute();
    expect(items).toHaveLength(1);
    expect(items[0].message_key).toBe("+15005550100-1-1700000000000");
    expect(items[0].status).toBe("pending");
    expect(items[0].received_at).toBe(1000);
  });
});
