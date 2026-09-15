import { describe, expect, it } from "vitest";
import {
  assertNotSetCorrectionMisroute,
  TRAINING_CORRECTION_MISROUTE_MESSAGE,
} from "./correction-guard.js";
import { looksLikeSetCorrectionPhrase } from "../modifications/set-correction-phrases.js";
import { UserInputError } from "../../../../worker/errors.js";

describe("looksLikeSetCorrectionPhrase", () => {
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
    expect(looksLikeSetCorrectionPhrase(input)).toBe(true);
  });

  it.each([
    "podciąganie 8",
    "podciąganie 3x8",
    "8",
    "7",
    "przysiad 80kg x5",
    "EMOM 12: thruster 15",
  ])("allows normal log %s", (input) => {
    expect(looksLikeSetCorrectionPhrase(input)).toBe(false);
  });

  it("throws a user-facing error for misrouted corrections", () => {
    expect(() => assertNotSetCorrectionMisroute("3 seria 7")).toThrow(
      UserInputError,
    );
    expect(() => assertNotSetCorrectionMisroute("3 seria 7")).toThrow(
      TRAINING_CORRECTION_MISROUTE_MESSAGE,
    );
  });
});
