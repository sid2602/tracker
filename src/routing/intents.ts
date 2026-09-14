import { z } from "zod";

/** Canonical actionable intents (ADR 0023). Single source for router + product registry. */
export const CANONICAL_ACTIONABLE_INTENTS = [
  "expenses.create",
  "expenses.report",
  "expenses.category",
  "expenses.modification",
] as const;

export type CanonicalActionableIntent =
  (typeof CANONICAL_ACTIONABLE_INTENTS)[number];

export const canonicalActionableIntentSchema = z.enum(
  CANONICAL_ACTIONABLE_INTENTS,
);

export const canonicalIntentSchema = z.enum([
  ...CANONICAL_ACTIONABLE_INTENTS,
  "ignore",
]);

export type CanonicalIntent = z.infer<typeof canonicalIntentSchema>;

/** Pre-migration `parsed_json` / residual legacy LLM strings. */
export const legacyRouterIntentSchema = z.enum([
  "expense",
  "report",
  "category",
  "modification",
  "ignore",
]);

export type LegacyRouterIntent = z.infer<typeof legacyRouterIntentSchema>;

const LEGACY_TO_CANONICAL = {
  expense: "expenses.create",
  report: "expenses.report",
  category: "expenses.category",
  modification: "expenses.modification",
  ignore: "ignore",
} as const satisfies Record<LegacyRouterIntent, CanonicalIntent>;

export function toCanonicalIntent(intent: string): CanonicalIntent {
  if (canonicalIntentSchema.safeParse(intent).success) {
    return canonicalIntentSchema.parse(intent);
  }

  const legacy = legacyRouterIntentSchema.parse(intent);
  return LEGACY_TO_CANONICAL[legacy];
}

export function isCanonicalActionableIntent(
  intent: CanonicalIntent,
): intent is CanonicalActionableIntent {
  return intent !== "ignore";
}
