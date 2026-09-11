import { describe, expect, it } from "vitest";
import { buildSendPayload } from "./client.js";

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
