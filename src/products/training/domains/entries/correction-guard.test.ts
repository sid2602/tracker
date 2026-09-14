import { describe, expect, it } from "vitest";
import {
  assertNotDeferredTrainingCorrection,
  looksLikeDeferredTrainingCorrection,
  TRAINING_CORRECTION_UNSUPPORTED_MESSAGE,
} from "./correction-guard.js";
import { UserInputError } from "../../../../worker/errors.js";

describe("looksLikeDeferredTrainingCorrection", () => {
  it.each([
    "3 seria 7",
    "3 serię 7",
    "ostatnia 7",
    "ostatnia seria 7",
    "last set 7",
    "last 7",
    "3rd set 7",
    "set 3 was 7",
  ])("detects correction-like %s", (input) => {
    expect(looksLikeDeferredTrainingCorrection(input)).toBe(true);
  });

  it.each([
    "podciąganie 8",
    "podciąganie 3x8",
    "8",
    "7",
    "przysiad 80kg x5",
    "EMOM 12: thruster 15",
  ])("allows normal log %s", (input) => {
    expect(looksLikeDeferredTrainingCorrection(input)).toBe(false);
  });

  it("throws a user-facing error for deferred corrections", () => {
    expect(() => assertNotDeferredTrainingCorrection("3 seria 7")).toThrow(
      UserInputError,
    );
    expect(() => assertNotDeferredTrainingCorrection("3 seria 7")).toThrow(
      TRAINING_CORRECTION_UNSUPPORTED_MESSAGE,
    );
  });
});
