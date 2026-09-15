import { productRegistry } from "../products/index.js";
import type { RoutingCard } from "./routing-types.js";

export const ROUTING_CARDS: readonly RoutingCard[] =
  productRegistry.routingCards;
