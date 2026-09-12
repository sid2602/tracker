import {
  containsPromptInjectionMarker,
} from "../../llm/prompt-data.js";
import { UserInputError } from "../../worker/errors.js";
import type { ModificationResult } from "./schema.js";

const SAFE_MODIFICATION_MESSAGE =
  "I could not safely identify the requested expense. Please specify its ID or exact date/details.";

export function validateModificationAgainstRawText(
  rawText: string,
  modification: ModificationResult,
  referenceDate?: string,
): void {
  const normalizedText = normalizeText(rawText);
  if (containsPromptInjectionMarker(normalizedText)) {
    rejectUnsafeModification();
  }
  validateActionAgainstRawText(normalizedText, modification.action);

  const explicitIdScan = extractExplicitIds(normalizedText);
  if (explicitIdScan.hasInvalidId) {
    rejectUnsafeModification();
  }
  const explicitIds = explicitIdScan.ids;
  const explicitId = getSingleExplicitId(explicitIds);
  if (explicitIds.length > 0) {
    if (
      explicitId === null ||
      modification.target !== "id" ||
      modification.id !== explicitId
    ) {
      rejectUnsafeModification();
    }
  }

  if (explicitIds.length === 0 && modification.target === "id") {
    rejectUnsafeModification();
  }

  if (hasUnsupportedRelativePeriod(normalizedText)) {
    rejectUnsafeModification();
  }

  const relativeDateOffset = getRelativeDateOffset(normalizedText);
  if (relativeDateOffset !== null) {
    const occurredOn = modification.searchCriteria?.occurredOn;
    if (modification.target !== "specific" || !occurredOn) {
      rejectUnsafeModification();
    }
    if (
      referenceDate !== undefined &&
      occurredOn !== shiftDate(referenceDate, relativeDateOffset)
    ) {
      rejectUnsafeModification();
    }
  }

  const asksForFirst = hasFirstSelector(normalizedText);
  const asksForLast = hasLastSelector(normalizedText);
  const unqualifiedLastRequest = isUnqualifiedLastRequest(
    normalizedText,
    modification.action,
  );

  if (
    modification.selection === "first" &&
    !asksForFirst
  ) {
    rejectUnsafeModification();
  }
  if (
    modification.selection === "last" &&
    !asksForLast
  ) {
    rejectUnsafeModification();
  }

  if (asksForFirst) {
    if (
      modification.target !== "specific" ||
      modification.selection !== "first"
    ) {
      rejectUnsafeModification();
    }
  }

  if (asksForLast) {
    if (unqualifiedLastRequest) {
      if (modification.target !== "last") {
        rejectUnsafeModification();
      }
    } else if (
      modification.target !== "specific" ||
      modification.selection !== "last"
    ) {
      rejectUnsafeModification();
    }
  } else if (
    modification.target === "last" &&
    !unqualifiedLastRequest
  ) {
    rejectUnsafeModification();
  }

  const mentionedAmounts = extractMentionedAmountsCents(normalizedText);
  const mentionedAmount = chooseMentionedAmount(
    modification,
    normalizedText,
    mentionedAmounts,
  );
  if (
    mentionedAmount !== null &&
    shouldTreatAmountAsSelector(modification, normalizedText)
  ) {
    if (
      modification.target !== "specific" ||
      modification.searchCriteria?.amountCents !== mentionedAmount
    ) {
      rejectUnsafeModification();
    }
  }

  const searchCriteria = modification.searchCriteria;
  if (searchCriteria?.keyword !== null && searchCriteria?.keyword !== undefined) {
    if (!hasTextEvidence(normalizedText, searchCriteria.keyword)) {
      rejectUnsafeModification();
    }
  }
  if (
    searchCriteria?.category !== null &&
    searchCriteria?.category !== undefined &&
    !hasTextEvidence(normalizedText, searchCriteria.category)
  ) {
    rejectUnsafeModification();
  }

  const updatePayload = modification.updatePayload;
  if (
    modification.action === "update" &&
    updatePayload?.category !== null &&
    updatePayload?.category !== undefined &&
    !hasTextEvidence(normalizedText, updatePayload.category)
  ) {
    rejectUnsafeModification();
  }
  if (
    modification.action === "update" &&
    updatePayload?.amountCents !== null &&
    updatePayload?.amountCents !== undefined &&
    mentionedAmount !== null &&
    updatePayload.amountCents !== mentionedAmount
  ) {
    rejectUnsafeModification();
  }
}

function rejectUnsafeModification(): never {
  throw new UserInputError(SAFE_MODIFICATION_MESSAGE);
}

function normalizeText(text: string): string {
  return text
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[.,!?;:()[\]{}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

type ExplicitIdScan = {
  ids: number[];
  hasInvalidId: boolean;
};

function extractExplicitIds(text: string): ExplicitIdScan {
  const scan: ExplicitIdScan = {
    ids: [],
    hasInvalidId: false,
  };
  const hashPattern = /#\s*(\d+)/gu;
  const namedPattern =
    /\b(?:id|number|no|nr|numer|wpis(?:u|ie)?)\s*(?:nr\.?\s*)?#?\s*(\d+)\b/giu;

  for (const match of text.matchAll(hashPattern)) {
    addScannedId(scan, match[1]);
  }
  for (const match of text.matchAll(namedPattern)) {
    addScannedId(scan, match[1]);
  }

  return scan;
}

function addScannedId(
  scan: ExplicitIdScan,
  idText: string | undefined,
): void {
  if (idText === undefined) {
    return;
  }

  const id = Number(idText);
  if (Number.isSafeInteger(id) && id > 0) {
    scan.ids.push(id);
  } else {
    scan.hasInvalidId = true;
  }
}

function getSingleExplicitId(ids: number[]): number | null {
  const uniqueIds = [...new Set(ids)];
  return uniqueIds.length === 1 ? (uniqueIds[0] ?? null) : null;
}

function validateActionAgainstRawText(
  text: string,
  action: ModificationResult["action"],
): void {
  const deleteCommand =
    /^(?:please\s+)?(?:undo|delete|remove|cancel|cofnij|anuluj|usuń|usun|skasuj)(?=$|[^\p{L}])/u.test(
      text,
    );
  const updateCommand =
    /^(?:please\s+)?(?:change|update|edit|modify|zmień|zmien|edytuj)(?=$|[^\p{L}])/u.test(
      text,
    );

  if (
    deleteCommand === updateCommand ||
    (deleteCommand && action !== "delete") ||
    (updateCommand && action !== "update")
  ) {
    rejectUnsafeModification();
  }
}

function hasUnsupportedRelativePeriod(text: string): boolean {
  return /\b(?:last|past)\s+(?:week|month|year)\b/u.test(text) ||
    /(?:zeszłym|zeszlym|ostatnim|poprzednim)\s+(?:tygodniu|miesiącu|miesiacu|roku)\b/u.test(
      text,
    );
}

function getRelativeDateOffset(text: string): number | null {
  const offsets: number[] = [];
  if (text.includes("yesterday") || text.includes("wczoraj")) {
    offsets.push(-1);
  }
  if (
    text.includes("today") ||
    text.includes("dzisiaj") ||
    text.includes("dziś") ||
    text.includes("dzis")
  ) {
    offsets.push(0);
  }
  if (
    text.includes("tomorrow") ||
    text.includes("jutro") ||
    text.includes("jutr")
  ) {
    offsets.push(1);
  }

  if (offsets.length > 1) {
    rejectUnsafeModification();
  }

  return offsets[0] ?? null;
}

function shiftDate(referenceDate: string, dayOffset: number): string {
  const [yearPart, monthPart, dayPart] = referenceDate.split("-");
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(
    Number(yearPart),
    Number(monthPart) - 1,
    Number(dayPart),
  );
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function hasFirstSelector(text: string): boolean {
  return text.includes("first") || text.includes("pierwsz");
}

function hasLastSelector(text: string): boolean {
  return (
    text.includes("last") ||
    text.includes("most recent") ||
    text.includes("latest") ||
    text.includes("previous") ||
    text.includes("ostatn") ||
    text.includes("poprzed")
  );
}

function isUnqualifiedLastRequest(
  text: string,
  action: ModificationResult["action"],
): boolean {
  if (text === "undo" || text === "cofnij" || text === "anuluj") {
    return true;
  }

  const lastSubject =
    "(?:last|latest|most recent|previous|ostatni|ostatnia|ostatnią|ostatnie|ostatniego|poprzedni|poprzednia)";
  const expenseNoun =
    "(?:expense|entry|purchase|item|transaction|wydatek|wpis|zakup|transakcję|transakcje)";
  const updateTail =
    action === "update"
      ? "(?:\\s+(?:amount|kwotę|kwota)\\s+(?:(?:to|na)\\s+\\d+(?:[.,]\\d{1,2})?|from\\s+\\d+(?:[.,]\\d{1,2})?\\s+to\\s+\\d+(?:[.,]\\d{1,2})?)\\s*(?:zł|zl|pln|eur|usd|gbp|€|\\$|£)?|\\s+(?:category|kategorię|kategoria)\\s+(?:to|na)\\s+\\p{L}+)?"
      : "";

  return (
    new RegExp(
      `^(?:please\\s+)?(?:undo|delete|remove|cancel|change|update|edit|modify)\\s+(?:the\\s+)?${lastSubject}(?:\\s+${expenseNoun})?${updateTail}$`,
      "u",
    ).test(text) ||
    new RegExp(
      `^(?:cofnij|anuluj|usuń|usun|skasuj|zmień|zmien|edytuj)\\s+(?:(?:ten|tę|te)\\s+)?${lastSubject}(?:\\s+${expenseNoun})?${updateTail}$`,
      "u",
    ).test(text)
  );
}

function shouldTreatAmountAsSelector(
  modification: ModificationResult,
  text: string,
): boolean {
  if (
    modification.action === "update" &&
    modification.updatePayload?.amountCents !== null &&
    modification.updatePayload?.amountCents !== undefined &&
    hasUpdateAmountPhrase(text)
  ) {
    return false;
  }

  return true;
}

function hasUpdateAmountPhrase(text: string): boolean {
  return /(?:amount|kwot(?:a|ę))[\p{L}\p{N}\s]{0,30}(?:to|na)(?:\s|$)/u.test(
    text,
  );
}

function extractMentionedAmountsCents(text: string): number[] {
  const amountPattern =
    /(\d+(?:[.,]\d{1,2})?)\s*(?:zł|zl|pln|eur|usd|gbp|€|\$|£)(?=$|[^\p{L}\p{N}])|(?:zł|zl|pln|eur|usd|gbp|€|\$|£)\s*(\d+(?:[.,]\d{1,2})?)(?=$|[^\p{L}\p{N}])/giu;
  const amounts: number[] = [];

  for (const match of text.matchAll(amountPattern)) {
    const amountText = match[1] ?? match[2];
    if (amountText === undefined) {
      continue;
    }
    const amountCents = decimalAmountToCents(amountText);
    if (amountCents !== null) {
      amounts.push(amountCents);
    }
  }

  return amounts;
}

function chooseMentionedAmount(
  modification: ModificationResult,
  text: string,
  amounts: number[],
): number | null {
  if (amounts.length === 0) {
    return null;
  }
  if (
    modification.action === "update" &&
    modification.updatePayload?.amountCents !== null &&
    modification.updatePayload?.amountCents !== undefined &&
    hasUpdateAmountPhrase(text)
  ) {
    return amounts[amounts.length - 1] ?? null;
  }

  return amounts[0] ?? null;
}

function decimalAmountToCents(value: string): number | null {
  const normalized = value.replace(",", ".");
  const [wholePart, fractionalPart] = normalized.split(".");
  if (
    wholePart === undefined ||
    !/^\d+$/u.test(wholePart) ||
    (fractionalPart !== undefined && !/^\d{1,2}$/u.test(fractionalPart))
  ) {
    return null;
  }

  const cents = Number(`${fractionalPart ?? ""}00`.slice(0, 2));
  const amountCents = Number(wholePart) * 100 + cents;
  return Number.isSafeInteger(amountCents) ? amountCents : null;
}

function hasTextEvidence(text: string, value: string): boolean {
  const textTokens = tokenize(text);
  const valueTokens = tokenize(value);

  return valueTokens.some((valueToken) => {
    if (valueToken.length < 3) {
      return false;
    }
    return textTokens.some(
      (textToken) =>
        textToken === valueToken ||
        stemToken(textToken) === stemToken(valueToken),
    );
  });
}

function tokenize(text: string): string[] {
  return text.toLocaleLowerCase().match(/\p{L}+/gu) ?? [];
}

function stemToken(token: string): string {
  const suffixes = [
    "ami",
    "owi",
    "owej",
    "ach",
    "em",
    "om",
    "ie",
    "ą",
    "ę",
    "a",
    "y",
    "i",
    "u",
    "e",
  ];

  for (const suffix of suffixes) {
    if (
      token.endsWith(suffix) &&
      token.length - suffix.length >= 3
    ) {
      return token.slice(0, -suffix.length);
    }
  }

  return token;
}
