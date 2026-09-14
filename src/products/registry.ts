import type { ProductModule } from "./types.js";
import {
  canonicalActionableIntentSchema,
  type CanonicalActionableIntent,
} from "../routing/intents.js";
import type { RoutingCard } from "../routing/routing-types.js";
import type { AnalyzeFn, HandleFn, PersistFn } from "./types.js";

export type ProductRegistry = {
  readonly products: readonly ProductModule[];
  readonly routingCards: readonly RoutingCard[];
  readonly analyzeByIntent: ReadonlyMap<CanonicalActionableIntent, AnalyzeFn>;
  readonly persistByIntent: ReadonlyMap<CanonicalActionableIntent, PersistFn>;
  readonly handleByIntent: ReadonlyMap<CanonicalActionableIntent, HandleFn>;
};

export function buildProductRegistry(
  products: readonly ProductModule[],
): ProductRegistry {
  const productIds = new Set<string>();
  const intentOwners = new Map<CanonicalActionableIntent, string>();
  const routingCards: RoutingCard[] = [];
  const analyzeByIntent = new Map<CanonicalActionableIntent, AnalyzeFn>();
  const persistByIntent = new Map<CanonicalActionableIntent, PersistFn>();
  const handleByIntent = new Map<CanonicalActionableIntent, HandleFn>();

  for (const product of products) {
    if (productIds.has(product.id)) {
      throw new Error(`Duplicate product id registered: ${product.id}`);
    }
    productIds.add(product.id);

    for (const card of product.routingCards) {
      const existingOwner = intentOwners.get(card.intent);
      if (existingOwner !== undefined) {
        throw new Error(
          `Duplicate canonical intent "${card.intent}" registered by products "${existingOwner}" and "${product.id}"`,
        );
      }
      intentOwners.set(card.intent, product.id);
      routingCards.push(card);
    }

    for (const intent of canonicalActionableIntentSchema.options) {
      const analyze = product.analyzeByIntent[intent];
      if (analyze !== undefined) {
        if (analyzeByIntent.has(intent)) {
          throw new Error(
            `Duplicate analyze handler for intent "${intent}" while registering product "${product.id}"`,
          );
        }
        analyzeByIntent.set(intent, analyze);
      }
      const persist = product.persistByIntent[intent];
      if (persist !== undefined) {
        if (persistByIntent.has(intent)) {
          throw new Error(
            `Duplicate persist handler for intent "${intent}" while registering product "${product.id}"`,
          );
        }
        persistByIntent.set(intent, persist);
      }
      const handle = product.handleByIntent[intent];
      if (handle !== undefined) {
        if (handleByIntent.has(intent)) {
          throw new Error(
            `Duplicate handle handler for intent "${intent}" while registering product "${product.id}"`,
          );
        }
        handleByIntent.set(intent, handle);
      }
    }
  }

  for (const intent of intentOwners.keys()) {
    if (!analyzeByIntent.has(intent)) {
      throw new Error(
        `Product registry missing analyze handler for intent "${intent}"`,
      );
    }
    if (!persistByIntent.has(intent)) {
      throw new Error(
        `Product registry missing persist handler for intent "${intent}"`,
      );
    }
    if (!handleByIntent.has(intent)) {
      throw new Error(
        `Product registry missing handle handler for intent "${intent}"`,
      );
    }
  }

  return {
    products,
    routingCards,
    analyzeByIntent,
    persistByIntent,
    handleByIntent,
  };
}
