import type { RouterResult } from "./schema.js";
import {
  MAX_TOTAL_PROMPT_CHARACTERS,
  MAX_USER_PROMPT_DATA_CHARACTERS,
} from "../llm/prompt-data.js";

export type ActionableIntent = Exclude<RouterResult["intent"], "ignore">;

export type RoutingCard = {
  readonly intent: ActionableIntent;
  readonly object: string;
  readonly goal: string;
  readonly localRules: readonly string[];
  readonly examples: readonly string[];
};

export const MAX_ROUTING_CARD_EXAMPLES = 5;
export const MAX_ROUTING_CARD_CHARACTERS = 2000;
export const MAX_ROUTER_USER_MESSAGE_CHARACTERS =
  MAX_USER_PROMPT_DATA_CHARACTERS;
export const MAX_ROUTER_PROMPT_CHARACTERS = MAX_TOTAL_PROMPT_CHARACTERS;
