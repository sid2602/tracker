/**
 * Shared detection for short set-correction phrases (Stage 3 modification path).
 */

export function looksLikeSetCorrectionPhrase(rawText: string): boolean {
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
