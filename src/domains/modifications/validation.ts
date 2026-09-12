import { containsPromptInjectionMarker } from "../../llm/prompt-data.js";
import { UserInputError } from "../../worker/errors.js";
import type { ModificationResult } from "./schema.js";
import {
  extractMentionedAmountsCents,
  chooseMentionedAmount,
  shouldTreatAmountAsSelector,
} from "./validation/amounts.js";
import { isActionConsistent } from "./validation/action.js";
import {
  extractExplicitIds,
  getRelativeDateOffset,
  getSingleExplicitId,
  hasAmbiguousRelativeDate,
  hasFirstSelector,
  hasLastSelector,
  hasUnsupportedRelativePeriod,
  isUnqualifiedLastRequest,
  shiftDate,
} from "./validation/selectors.js";
import { hasTextEvidence, normalizeText } from "./validation/text.js";

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
  if (!isActionConsistent(normalizedText, modification.action)) {
    rejectUnsafeModification();
  }

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

  if (hasAmbiguousRelativeDate(normalizedText)) {
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

  if (modification.selection === "first" && !asksForFirst) {
    rejectUnsafeModification();
  }
  if (modification.selection === "last" && !asksForLast) {
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
