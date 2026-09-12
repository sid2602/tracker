import { describe, expect, it } from "vitest";
import {
  extractMentionedAmountsCents,
  hasUpdateAmountPhrase,
} from "./amounts.js";
import { isActionConsistent } from "./action.js";
import {
  getRelativeDateOffset,
  hasAmbiguousRelativeDate,
  shiftDate,
} from "./selectors.js";
import { hasTextEvidence, normalizeText } from "./text.js";

describe("modification validation helpers", () => {
  it("normalizes text and keeps evidence matching deterministic", () => {
    expect(normalizeText("  Kawa, 15 PLN! ")).toBe("kawa 15 pln");
    expect(hasTextEvidence("usuń wczorajszą kawę", "kawy")).toBe(true);
    expect(hasTextEvidence("usuń kawę", "dinner")).toBe(false);
  });

  it("recognizes action and update amount phrases", () => {
    expect(isActionConsistent("delete the last expense", "delete")).toBe(true);
    expect(isActionConsistent("delete the last expense", "update")).toBe(false);
    expect(hasUpdateAmountPhrase("change amount to 120 pln")).toBe(true);
    expect(extractMentionedAmountsCents("from 50 to 120 pln")).toEqual([12000]);
  });

  it("resolves relative dates and rejects ambiguous date expressions", () => {
    expect(getRelativeDateOffset("delete yesterday")).toBe(-1);
    expect(hasAmbiguousRelativeDate("delete yesterday and today")).toBe(true);
    expect(shiftDate("2026-09-11", -1)).toBe("2026-09-10");
  });
});
