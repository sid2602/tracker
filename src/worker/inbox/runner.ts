import { logger } from "../../lib/logger.js";
import type { AppDeps } from "../types.js";
import { processNextInboxItem } from "./processor.js";

const POLL_INTERVAL_MS = 1_000;

export async function runInboxProcessor(
  deps: AppDeps,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      const didWork = await processNextInboxItem(deps);
      if (didWork && !signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      } else if (!didWork && !signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    } catch (error: unknown) {
      logger.error({ error }, "Error in inbox processor loop");
      if (!signal.aborted) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }
    }
  }
}
