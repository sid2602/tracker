import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "./config.js";

function stubRequiredEnvironment(): void {
  vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
  vi.stubEnv("LLM_PROVIDER", "openai");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubEnv("DATABASE_PATH", ":memory:");
  vi.stubEnv("SIGNAL_RPC_HOST", "localhost");
  vi.stubEnv("SIGNAL_RPC_PORT", "8080");
  vi.stubEnv("SIGNAL_PHONE_NUMBER", "+48123123123");
  vi.stubEnv("LANGFUSE_PUBLIC_KEY", "");
  vi.stubEnv("LANGFUSE_SECRET_KEY", "");
  vi.stubEnv("LANGFUSE_BASE_URL", "https://cloud.langfuse.com");
}

describe("loadConfig", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses and deduplicates multiple allowed Signal device IDs", () => {
    stubRequiredEnvironment();
    vi.stubEnv("SIGNAL_ALLOWED_INPUT_DEVICE_IDS", "1, 3, 1");

    expect(loadConfig().signalAllowedInputDeviceIds).toEqual([1, 3]);
  });

  it("rejects invalid Signal device IDs", () => {
    stubRequiredEnvironment();
    vi.stubEnv("SIGNAL_ALLOWED_INPUT_DEVICE_IDS", "1,not-a-device");

    expect(() => loadConfig()).toThrow();
  });

});
