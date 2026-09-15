import { UserInputError } from "../../../../worker/errors.js";
import { looksLikeSetCorrectionPhrase } from "../modifications/set-correction-phrases.js";

export const TRAINING_CORRECTION_MISROUTE_MESSAGE =
  "Set corrections belong on the modification path (e.g. \"3 seria 7\"). This message was treated as a new log and rejected.";

/**
 * Fail-closed guard for misrouted `training.log` traffic that looks like a set correction.
 */
export function assertNotSetCorrectionMisroute(rawText: string): void {
  if (looksLikeSetCorrectionPhrase(rawText)) {
    throw new UserInputError(TRAINING_CORRECTION_MISROUTE_MESSAGE);
  }
}
