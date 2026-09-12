import type { ModificationResult } from "../schema.js";

export function chooseMentionedAmount(
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

export function extractMentionedAmountsCents(text: string): number[] {
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

export function shouldTreatAmountAsSelector(
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

export function hasUpdateAmountPhrase(text: string): boolean {
  return /(?:amount|kwot(?:a|ę))[\p{L}\p{N}\s]{0,30}(?:to|na)(?:\s|$)/u.test(
    text,
  );
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
