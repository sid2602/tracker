import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import {
  createTestConfig,
  createTestDeps,
  openTestDatabase,
} from "../../test/fixtures.js";
import { runInboxProcessor } from "./runner.js";

const processNextInboxItemMock = vi.fn();

vi.mock("./processor.js", () => ({
  processNextInboxItem: (...args: unknown[]) =>
    processNextInboxItemMock(...args),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

const config = createTestConfig();

describe("inbox processor runner", () => {
  let db: Kysely<AppDatabase>;

  beforeEach(() => {
    vi.useFakeTimers();
    processNextInboxItemMock.mockReset();
    db = openTestDatabase();
  });

  afterEach(async () => {
    vi.useRealTimers();
    await db.destroy();
  });

  it("keeps the ten-second delay after successful work", async () => {
    const controller = new AbortController();
    processNextInboxItemMock
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async () => {
        controller.abort();
        return false;
      });
    const deps = createTestDeps(db, { config });

    const runner = runInboxProcessor(deps, controller.signal);
    await Promise.resolve();
    expect(processNextInboxItemMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(9_999);
    expect(processNextInboxItemMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    await expect(runner).resolves.toBeUndefined();
    expect(processNextInboxItemMock).toHaveBeenCalledTimes(2);
  });
});
