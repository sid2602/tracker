/**
 * Deterministic Stage-3 set corrections ("3 seria 7", "ostatnia 7").
 * Returns null when the text is not a clear correction phrase.
 */
import type { TrainingModificationResult } from "./schema.js";
import { looksLikeSetCorrectionPhrase } from "./set-correction-phrases.js";

export function tryParseDeterministicSetCorrection(
  rawText: string,
): TrainingModificationResult | null {
  if (!looksLikeSetCorrectionPhrase(rawText)) {
    return null;
  }

  const text = rawText.trim().toLowerCase().replace(/\s+/g, " ");

  const numbered =
    text.match(/^(\d+)\s*(?:seria|serię|serie|series|set)\s+(\d+)$/u) ??
    text.match(/^(\d+)(?:st|nd|rd|th)\s+set\s+(\d+)$/u) ??
    text.match(/^(?:set|seria|serię)\s*(\d+)\s*(?:was|=|:)?\s*(\d+)$/u);

  if (numbered) {
    const setIndex = Number(numbered[1]);
    const reps = Number(numbered[2]);
    if (!Number.isSafeInteger(setIndex) || !Number.isSafeInteger(reps)) {
      return null;
    }
    return {
      action: "correct_set",
      target: "set",
      setIndex,
      id: null,
      updatePayload: {
        reps,
        weightGrams: null,
        durationSeconds: null,
      },
    };
  }

  const last =
    text.match(/^(?:ostatnia|ostatni|last)\s+(?:seria|serię|serie|set)?\s*(\d+)$/u);

  if (last) {
    const reps = Number(last[1]);
    if (!Number.isSafeInteger(reps)) {
      return null;
    }
    return {
      action: "correct_set",
      target: "set",
      setIndex: null,
      id: null,
      updatePayload: {
        reps,
        weightGrams: null,
        durationSeconds: null,
      },
    };
  }

  return null;
}
