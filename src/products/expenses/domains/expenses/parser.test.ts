import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestConfig } from "../../../../test/fixtures.js";
import { parseExpenses } from "./parser.js";

const generateObjectMock = vi.fn();

vi.mock("ai", () => ({
  generateObject: (...args: unknown[]) => generateObjectMock(...args),
}));

vi.mock("../../../../llm/provider.js", () => ({
  getModel: vi.fn(() => "mock-model"),
}));

const config = createTestConfig();

describe("parseExpenses", () => {
  beforeEach(() => {
    generateObjectMock.mockReset();
  });

  it("retries after first failure", async () => {
    generateObjectMock
      .mockRejectedValueOnce(new Error("invalid response"))
      .mockResolvedValueOnce({
        object: {
          items: [
            {
              amountCents: 1500,
              currency: "PLN",
              category: "groceries",
              occurredOn: "2026-09-01",
              note: "zakupy",
            },
          ],
        },
      });

    await expect(
      parseExpenses(config, "zakupy 15 zl", "2026-09-01", [{ name: "groceries", description: "supermarket" }, { name: "food", description: null }]),
    ).resolves.toEqual({
      items: [
        {
          amountCents: 1500,
          currency: "PLN",
          category: "groceries",
          occurredOn: "2026-09-01",
          note: "zakupy",
        },
      ],
    });

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });

  it("throws after two failed attempts", async () => {
    generateObjectMock.mockRejectedValue(new Error("invalid response"));

    await expect(
      parseExpenses(config, "zakupy 15 zl", "2026-09-01", [{ name: "groceries", description: "supermarket" }, { name: "food", description: null }]),
    ).rejects.toThrow("invalid response");

    expect(generateObjectMock).toHaveBeenCalledTimes(2);
  });
});
