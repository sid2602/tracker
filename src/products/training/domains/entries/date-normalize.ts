/**
 * Force occurredOn to the reference date when the user message has no date cue.
 * Prevents the LLM from inventing "yesterday" for bare set logs like "podciąganie 9".
 */
import type { TrainingLogResult } from "./schema.js";

const RELATIVE_DATE_WORDS = [
  "yesterday",
  "today",
  "tomorrow",
  "wczoraj",
  "dzisiaj",
  "dziś",
  "dzis",
  "jutro",
  "poniedziałek",
  "poniedzialek",
  "wtorek",
  "środa",
  "sroda",
  "czwartek",
  "piątek",
  "piatek",
  "sobota",
  "niedziela",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

const ISO_OR_SLASH_DATE =
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?\b/;

export function messageHasExplicitDateCue(rawText: string): boolean {
  const lower = rawText.toLowerCase();
  if (RELATIVE_DATE_WORDS.some((word) => lower.includes(word))) {
    return true;
  }
  return ISO_OR_SLASH_DATE.test(rawText);
}

export function normalizeTrainingLogDates(
  parsed: TrainingLogResult,
  rawText: string,
  referenceDate: string,
): TrainingLogResult {
  if (messageHasExplicitDateCue(rawText)) {
    return parsed;
  }

  return {
    entries: parsed.entries.map((entry) => ({
      ...entry,
      occurredOn: referenceDate,
    })),
  };
}
