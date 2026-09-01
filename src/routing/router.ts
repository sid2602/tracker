import type { Config } from "../config.js";
import { generateStructured } from "../llm/generate.js";
import { getRouterPrompt } from "./prompt.js";
import { routerResultSchema, type RouterResult } from "./schema.js";

export async function routeMessage(
  config: Config,
  text: string,
): Promise<RouterResult> {
  return generateStructured(config, routerResultSchema, getRouterPrompt(text));
}
