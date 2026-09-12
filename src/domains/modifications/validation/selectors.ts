import type { ModificationResult } from "../schema.js";

export type ExplicitIdScan = {
  ids: number[];
  hasInvalidId: boolean;
};

export function extractExplicitIds(text: string): ExplicitIdScan {
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

export function getSingleExplicitId(ids: number[]): number | null {
  const uniqueIds = [...new Set(ids)];
  return uniqueIds.length === 1 ? (uniqueIds[0] ?? null) : null;
}

export function hasUnsupportedRelativePeriod(text: string): boolean {
  return (
    /\b(?:last|past)\s+(?:week|month|year)\b/u.test(text) ||
    /(?:zeszłym|zeszlym|ostatnim|poprzednim)\s+(?:tygodniu|miesiącu|miesiacu|roku)\b/u.test(
      text,
    )
  );
}

export function getRelativeDateOffset(text: string): number | null {
  const offsets = getRelativeDateOffsets(text);
  return offsets[0] ?? null;
}

export function hasAmbiguousRelativeDate(text: string): boolean {
  return getRelativeDateOffsets(text).length > 1;
}

function getRelativeDateOffsets(text: string): number[] {
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

  return offsets;
}

export function shiftDate(referenceDate: string, dayOffset: number): string {
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

export function hasFirstSelector(text: string): boolean {
  return text.includes("first") || text.includes("pierwsz");
}

export function hasLastSelector(text: string): boolean {
  return (
    text.includes("last") ||
    text.includes("most recent") ||
    text.includes("latest") ||
    text.includes("previous") ||
    text.includes("ostatn") ||
    text.includes("poprzed")
  );
}

export function isUnqualifiedLastRequest(
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
