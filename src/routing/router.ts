import type { Config } from "../config.js";
import { generateStructured } from "../llm/generate.js";
import { getRouterPrompt } from "./prompt.js";
import {
  routerLlmSchema,
  toRouterResult,
  type RouterResult,
} from "./schema.js";

export async function routeMessage(
  config: Config,
  text: string,
): Promise<RouterResult> {
  const raw = await generateStructured(
    config,
    routerLlmSchema,
    getRouterPrompt(text),
    "llm.router",
  );

  return toRouterResult(raw);
}
