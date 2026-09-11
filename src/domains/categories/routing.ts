import type { RoutingCard } from "../../routing/routing-types.js";

export const categoryRoutingCard: RoutingCard = {
  intent: "category",
  object: "the expense category catalog",
  goal: "list, add, or remove a category",
  localRules: [
    "Category operations target the catalog of available categories.",
  ],
  examples: [
    "dodaj kategorię dom",
    "add category home",
    "Füge die Kategorie Haushalt hinzu",
    "añade la categoría hogar",
    "покажи мої категорії",
  ],
};
