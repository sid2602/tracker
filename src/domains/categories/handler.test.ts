import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../config.js";
import { initSchema, openDatabase } from "../../db/connection.js";
import type { AppDeps } from "../../worker/types.js";
import { handleCategory } from "./handler.js";
import type { CategoryAction } from "./schema.js";

const config: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: "./data/expenses.db",
  signalRpcHost: "signal-cli-rest-api",
  signalRpcPort: 6001,
  signalPhoneNumber: "+15005550100",
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: "https://cloud.langfuse.com",
};

const parseCategoryActionMock = vi.fn<
  (config: Config, text: string) => Promise<CategoryAction>
>();

vi.mock("./parser.js", () => ({
  parseCategoryAction: (configArg: Config, text: string) =>
    parseCategoryActionMock(configArg, text),
}));

vi.mock("../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe("handleCategory", () => {
  let tempDir: string;
  let dbPath: string;
  let deps: AppDeps;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), "tracker-cat-test-"));
    dbPath = join(tempDir, "expenses.db");
    const db = openDatabase(dbPath);
    await initSchema(db);
    deps = { db, config };
    parseCategoryActionMock.mockReset();
    
    // remove default categories for consistent testing
    await deps.db.deleteFrom("categories").execute();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deps.db.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("lists empty categories", async () => {
    parseCategoryActionMock.mockResolvedValue({ action: "list", categoryName: null });

    const result = await handleCategory(deps, {
      messageKey: "test-key", sourceAuthor: "+480", sourceTimestamp: 1, rawText: "list",
    });

    expect(result).toEqual({
      kind: "success",
      message: "You don't have any saved categories.",
    });
  });

  it("adds a new category and lists it", async () => {
    parseCategoryActionMock.mockResolvedValue({ action: "add", categoryName: "pets" });

    const resultAdd = await handleCategory(deps, {
      messageKey: "test-key-1", sourceAuthor: "+480", sourceTimestamp: 1, rawText: "add pets",
    });

    expect(resultAdd).toEqual({
      kind: "success",
      message: "Category added: pets",
    });

    parseCategoryActionMock.mockResolvedValue({ action: "list", categoryName: null });
    const resultList = await handleCategory(deps, {
      messageKey: "test-key-2", sourceAuthor: "+480", sourceTimestamp: 2, rawText: "list",
    });

    expect(resultList).toEqual({
      kind: "success",
      message: "Your categories: pets",
    });
  });

  it("handles duplicate category add", async () => {
    parseCategoryActionMock.mockResolvedValue({ action: "add", categoryName: "pets" });

    await handleCategory(deps, { messageKey: "1", sourceAuthor: "+480", sourceTimestamp: 1, rawText: "add pets" });
    const resultDuplicate = await handleCategory(deps, { messageKey: "2", sourceAuthor: "+480", sourceTimestamp: 2, rawText: "add pets" });

    expect(resultDuplicate).toEqual({
      kind: "success",
      message: "Category 'pets' already exists.",
    });
  });

  it("removes a category", async () => {
    parseCategoryActionMock.mockResolvedValue({ action: "add", categoryName: "pets" });
    await handleCategory(deps, { messageKey: "1", sourceAuthor: "+480", sourceTimestamp: 1, rawText: "add pets" });

    parseCategoryActionMock.mockResolvedValue({ action: "remove", categoryName: "pets" });
    const resultRemove = await handleCategory(deps, { messageKey: "2", sourceAuthor: "+480", sourceTimestamp: 2, rawText: "remove pets" });

    expect(resultRemove).toEqual({
      kind: "success",
      message: "Category removed: pets",
    });
  });

  it("handles missing category name", async () => {
    parseCategoryActionMock.mockResolvedValue({ action: "add", categoryName: null });

    const result = await handleCategory(deps, {
      messageKey: "1", sourceAuthor: "+480", sourceTimestamp: 1, rawText: "add",
    });

    expect(result).toEqual({
      kind: "failure",
      message: "No category name provided to add.",
    });
  });
});
