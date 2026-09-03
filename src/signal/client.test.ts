import { afterEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../config.js";
import {
  buildReceiveWebSocketUrl,
  parseWebSocketPayload,
  sendMessage,
} from "./client.js";

const config: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: "./data/expenses.db",
  signalApiUrl: "http://127.0.0.1:8080",
  signalPhoneNumber: "+15005550100",
};

describe("signal client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds a websocket receive URL", () => {
    expect(buildReceiveWebSocketUrl(config)).toBe(
      "ws://127.0.0.1:8080/v1/receive/%2B15005550100",
    );
  });

  it("parses websocket JSON payloads", () => {
    expect(parseWebSocketPayload(`{"ok":true}`)).toEqual({ ok: true });
    expect(parseWebSocketPayload("not-json")).toBeNull();
    expect(
      parseWebSocketPayload(new TextEncoder().encode(`{"n":1}`)),
    ).toEqual({ n: 1 });
  });

  it("sends a message through /v2/send", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => "",
    });
    vi.stubGlobal("fetch", fetchMock);

    await sendMessage(config, "+15005550100", "Saved 1 item");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    if (!call) {
      return;
    }

    const [url, init] = call;
    expect(String(url)).toBe("http://127.0.0.1:8080/v2/send");
    expect(init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!init || typeof init !== "object" || !("body" in init)) {
      throw new Error("expected fetch body");
    }

    expect(JSON.parse(String(init.body))).toEqual({
      message: "Saved 1 item",
      number: "+15005550100",
      recipients: ["+15005550100"],
    });
  });

  it("throws when send fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
      }),
    );

    await expect(
      sendMessage(config, "+15005550100", "Saved 1 item"),
    ).rejects.toThrow("Signal send failed: 500 boom");
  });
});
