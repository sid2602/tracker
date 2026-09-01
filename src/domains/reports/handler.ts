import type { RouterResult } from "../../routing/schema.js";
import type { AppDeps, HandlerResult } from "../../worker/types.js";

export async function handleReport(
  _deps: AppDeps,
  _route: Extract<RouterResult, { intent: "report" }>,
): Promise<HandlerResult> {
  return {
    kind: "failure",
    message: "Raport nie jest jeszcze zaimplementowany",
  };
}
