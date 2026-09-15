import { describe, expect, it } from "vitest";
import { toCanonicalIntent } from "./intents.js";

describe("toCanonicalIntent", () => {
  it("maps legacy router strings to canonical ids", () => {
    expect(toCanonicalIntent("expense")).toBe("expenses.create");
    expect(toCanonicalIntent("report")).toBe("expenses.report");
    expect(toCanonicalIntent("category")).toBe("expenses.category");
    expect(toCanonicalIntent("modification")).toBe("expenses.modification");
    expect(toCanonicalIntent("ignore")).toBe("ignore");
  });

  it("passes through canonical ids", () => {
    expect(toCanonicalIntent("expenses.create")).toBe("expenses.create");
    expect(toCanonicalIntent("ignore")).toBe("ignore");
  });

  it("rejects unknown intents", () => {
    expect(() => toCanonicalIntent("workout")).toThrow();
  });
});
