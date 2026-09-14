import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestConfig } from "../../../../test/fixtures.js";
import { parseCategoryAction } from "./parser.js";

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock("../../../../llm/provider.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

const config = createTestConfig();

describe("parseCategoryAction", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("retries after first failure", async () => {
    generateObjectMock
      .mockRejectedValueOnce(new Error("invalid response"))
      .mockResolvedValueOnce({
        object: { action: "add", categoryName: "pets", description: "karma" },
      });

    await expect(
      parseCategoryAction(config, "add pets category"),
    ).resolves.toEqual({
      action: "add",
      categoryName: "pets",
      description: "karma",
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two failed attempts", async () => {
    generateObjectMock.mockRejectedValue(new Error("invalid response"));

    await expect(
      parseCategoryAction(config, "add something"),
    ).rejects.toThrow("invalid response");

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
