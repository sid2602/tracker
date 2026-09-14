import type { QueryCreator } from "kysely";
import type { AppDatabase } from "../db/schema.js";
import type { CanonicalActionableIntent } from "../routing/intents.js";
import type { RoutingCard } from "../routing/routing-types.js";
import type { AppDeps, HandlerResult, MessageContext } from "../worker/types.js";

export type AnalyzeFn = (
  deps: AppDeps,
  context: MessageContext,
) => Promise<unknown>;

export type PersistFn = (
  deps: AppDeps,
  context: MessageContext,
  parsed: unknown,
  db?: QueryCreator<AppDatabase>,
) => Promise<HandlerResult>;

export type HandleFn = (
  deps: AppDeps,
  context: MessageContext,
) => Promise<HandlerResult>;

export type ProductModule = {
  readonly id: string;
  readonly routingCards: readonly RoutingCard[];
  readonly analyzeByIntent: Readonly<
    Partial<Record<CanonicalActionableIntent, AnalyzeFn>>
  >;
  readonly persistByIntent: Readonly<
    Partial<Record<CanonicalActionableIntent, PersistFn>>
  >;
  readonly handleByIntent: Readonly<
    Partial<Record<CanonicalActionableIntent, HandleFn>>
  >;
};
