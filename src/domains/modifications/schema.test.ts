import { describe, expect, it } from "vitest";
import { modificationResultSchema } from "./schema.js";

describe("modifications schema", () => {
  it("accepts valid delete by last target", () => {
    const result = modificationResultSchema.parse({
      action: "delete",
      target: "last",
    });
    expect(result.action).toBe("delete");
    expect(result.target).toBe("last");
  });

  it("accepts valid delete by specific target with criteria", () => {
    const result = modificationResultSchema.parse({
      action: "delete",
      target: "specific",
      searchCriteria: {
        category: "Kawa",
        amountCents: 1500,
      }
    });
    expect(result.action).toBe("delete");
    expect(result.target).toBe("specific");
    expect(result.searchCriteria?.category).toBe("Kawa");
  });

  it("accepts valid delete by id", () => {
    const result = modificationResultSchema.parse({
      action: "delete",
      target: "id",
      id: 42
    });
    expect(result.action).toBe("delete");
    expect(result.target).toBe("id");
    expect(result.id).toBe(42);
  });

  it("rejects invalid action", () => {
    expect(() =>
      modificationResultSchema.parse({
        action: "unknown",
        target: "last",
      })
    ).toThrow();
  });

  it("rejects negative amountCents in search criteria", () => {
    expect(() =>
      modificationResultSchema.parse({
        action: "delete",
        target: "specific",
        searchCriteria: {
          amountCents: -500
        }
      })
    ).toThrow();
  });
});
