import { UserInputError } from "../../../../worker/errors.js";

export const TRAINING_CORRECTION_UNSUPPORTED_MESSAGE =
  "Set corrections are not supported yet. Log a full set (e.g. \"podciąganie 7\") instead.";

/**
 * Stage 2 fail-closed: correction-like messages must not create new rows.
 * Stage 3 owns updating a prior set after an NxR prescription.
 */
export function assertNotDeferredTrainingCorrection(rawText: string): void {
  if (looksLikeDeferredTrainingCorrection(rawText)) {
    throw new UserInputError(TRAINING_CORRECTION_UNSUPPORTED_MESSAGE);
  }
}

export function looksLikeDeferredTrainingCorrection(rawText: string): boolean {
  const text = rawText.trim().toLowerCase().replace(/\s+/g, " ");
  if (text.length === 0) {
    return false;
  }

  // "3 seria 7", "3 serię 7", "3rd set 7", "set 3 was 7"
  if (
    /^\d+\s*(seria|serię|serie|series|set)\s+\d+$/u.test(text) ||
    /^\d+(st|nd|rd|th)\s+set\s+\d+$/u.test(text) ||
    /^(set|seria|serię)\s*\d+\s*(was|=|:)?\s*\d+$/u.test(text)
  ) {
    return true;
  }

  // "ostatnia 7", "ostatnia seria 7", "last set 7", "last 7"
  if (
    /^(ostatnia|ostatni|last)\s+(seria|serię|serie|set)?\s*\d+$/u.test(text)
  ) {
    return true;
  }

  return false;
}
