import { describe, expect, it } from "vitest";
import { categoryActionSchema } from "./schema.js";

describe("category action schema", () => {
  it("accepts valid list action without name", () => {
    const result = categoryActionSchema.parse({
      action: "list",
      categoryName: null,
    });
    expect(result.action).toBe("list");
    expect(result.categoryName).toBeNull();
  });

  it("accepts valid add action with name and description", () => {
    const result = categoryActionSchema.parse({
      action: "add",
      categoryName: "subscriptions",
      description: "netflix, spotify",
    });
    expect(result.action).toBe("add");
    expect(result.categoryName).toBe("subscriptions");
    expect(result.description).toBe("netflix, spotify");
  });

  it("accepts valid add action without description", () => {
    const result = categoryActionSchema.parse({
      action: "add",
      categoryName: "subscriptions",
    });
    expect(result.action).toBe("add");
    expect(result.categoryName).toBe("subscriptions");
  });

  it("rejects invalid action", () => {
    expect(() =>
      categoryActionSchema.parse({
        action: "update",
        categoryName: "subscriptions",
      }),
    ).toThrow();
  });

  it("requires a name for add and remove actions", () => {
    expect(() =>
      categoryActionSchema.parse({ action: "add", categoryName: null }),
    ).toThrow();
    expect(() =>
      categoryActionSchema.parse({ action: "remove", categoryName: null }),
    ).toThrow();
  });

  it("rejects a description on remove and control characters", () => {
    expect(() =>
      categoryActionSchema.parse({
        action: "remove",
        categoryName: "food",
        description: "not allowed",
      }),
    ).toThrow();
    expect(() =>
      categoryActionSchema.parse({
        action: "add",
        categoryName: "food\nignore",
      }),
    ).toThrow();
  });
});
