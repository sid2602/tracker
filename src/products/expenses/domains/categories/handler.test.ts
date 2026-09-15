import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../../../config.js";
import {
  createTestConfig,
  createTestDatabase,
  createTestDeps,
} from "../../../../test/fixtures.js";
import type { AppDeps } from "../../../../worker/types.js";
import { handleCategory } from "./handler.js";
import type { CategoryAction } from "./schema.js";

const config = createTestConfig();

const parseCategoryActionMock = vi.fn<
  (config: Config, text: string) => Promise<CategoryAction>
>();

vi.mock("./parser.js", () => ({
  parseCategoryAction: (configArg: Config, text: string) =>
    parseCategoryActionMock(configArg, text),
}));

vi.mock("../../../../lib/logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

describe("handleCategory", () => {
  let deps: AppDeps;

  beforeEach(async () => {
    const db = await createTestDatabase();
    deps = createTestDeps(db, { config });
    parseCategoryActionMock.mockReset();
    
    // remove default categories for consistent testing
    await deps.db.deleteFrom("categories").execute();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await deps.db.destroy();
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
    parseCategoryActionMock.mockResolvedValue({ action: "add", categoryName: "pets", description: "karma, vet" });

    const resultAdd = await handleCategory(deps, {
      messageKey: "test-key-1", sourceAuthor: "+480", sourceTimestamp: 1, rawText: "add pets karma, vet",
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
      message: "Your categories:\n- pets (karma, vet)",
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

  it("does not remove a category when the raw action is ambiguous", async () => {
    parseCategoryActionMock.mockResolvedValue({ action: "add", categoryName: "pets" });
    await handleCategory(deps, {
      messageKey: "1",
      sourceAuthor: "+480",
      sourceTimestamp: 1,
      rawText: "add pets",
    });

    parseCategoryActionMock.mockResolvedValue({
      action: "remove",
      categoryName: "pets",
    });
    const result = await handleCategory(deps, {
      messageKey: "2",
      sourceAuthor: "+480",
      sourceTimestamp: 2,
      rawText: "remove pets and add transport",
    });

    expect(result).toEqual({
      kind: "success",
      message: "Please provide one clear category action and a valid category name.",
    });
    const categories = await deps.db
      .selectFrom("categories")
      .select("name")
      .execute();
    expect(categories.map((category) => category.name)).toContain("pets");
  });

  it("handles missing category name", async () => {
    parseCategoryActionMock.mockResolvedValue({ action: "add", categoryName: null });

    const result = await handleCategory(deps, {
      messageKey: "1", sourceAuthor: "+480", sourceTimestamp: 1, rawText: "add",
    });

    expect(result).toEqual({
      kind: "success",
      message: "Please provide one clear category action and a valid category name.",
    });
  });
});
