import * as net from "node:net";
import { describe, expect, it } from "vitest";
import type { Config } from "../config.js";
import { buildSendPayload, listenForMessages } from "./client.js";

describe("Signal send payload", () => {
  it("does not request a self notification", () => {
    expect(buildSendPayload("request-1", "+15005550100", "Saved 1 item")).toEqual({
      jsonrpc: "2.0",
      method: "send",
      params: {
        message: "Saved 1 item",
        recipient: ["+15005550100"],
        notifySelf: true,
      },
      id: "request-1",
    });
  });
});

describe("Signal receive lifecycle", () => {
  it("drains a bounded burst before graceful shutdown", async () => {
    const server = await createServer();
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address");
    }

    const controller = new AbortController();
    const receivedIds: number[] = [];
    let resolveFirst: (() => void) | undefined;
    let releaseFirst: (() => void) | undefined;
    const firstReceived = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });
    const firstRelease = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const payloads = Array.from({ length: 102 }, (_, index) =>
      JSON.stringify({ method: "receive", id: index }) + "\n",
    );

    server.on("connection", (socket) => {
      socket.write(payloads.join(""));
    });

    const listener = listenForMessages(
      testConfig(address.port),
      async (payload) => {
        receivedIds.push(extractId(payload));
        if (receivedIds.length === 1) {
          resolveFirst?.();
          await firstRelease;
        }
      },
      { signal: controller.signal },
    );

    await firstReceived;
    expect(receivedIds).toEqual([0]);
    releaseFirst?.();
    await waitFor(() => receivedIds.length === 102);
    controller.abort();
    await listener;
    await closeServer(server);

    expect(receivedIds).toEqual(Array.from({ length: 102 }, (_, index) => index));
    expect(new Set(receivedIds).size).toBe(102);
  });

  it("rejects malformed JSON frames instead of continuing the connection", async () => {
    const server = await createServer();
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not expose a TCP address");
    }

    const controller = new AbortController();
    let resolveConnection: (() => void) | undefined;
    const connected = new Promise<void>((resolve) => {
      resolveConnection = resolve;
    });
    let connectionCount = 0;
    const receivedIds: number[] = [];
    server.on("connection", (socket) => {
      connectionCount++;
      resolveConnection?.();
      if (connectionCount === 1) {
        socket.write(
          '{ "method": \n' +
            JSON.stringify({ method: "receive", id: 1 }) +
            "\n",
        );
      }
    });

    const listener = listenForMessages(
      testConfig(address.port),
      async (payload) => {
        receivedIds.push(extractId(payload));
      },
      { signal: controller.signal },
    );

    await connected;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    controller.abort();
    await listener;
    await closeServer(server);

    expect(receivedIds).toEqual([]);
  });
});

function testConfig(port: number): Config {
  return {
    aiGatewayApiKey: "test",
    llmProvider: "openai",
    llmModel: "test",
    databasePath: ":memory:",
    signalRpcHost: "127.0.0.1",
    signalRpcPort: port,
    signalPhoneNumber: "+15005550100",
    signalAllowedInputDeviceIds: [1],
    langfusePublicKey: null,
    langfuseSecretKey: null,
    langfuseBaseUrl: "https://example.test",
  };
}

async function createServer(): Promise<net.Server> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve();
    });
  });
  return server;
}

async function closeServer(server: net.Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function waitFor(condition: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error("Timed out waiting for Signal receive test");
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
}

function extractId(payload: unknown): number {
  if (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    "id" in payload &&
    typeof payload.id === "number"
  ) {
    return payload.id;
  }
  throw new Error("Signal test payload did not have a numeric id");
}
