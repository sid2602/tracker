import type { Kysely } from "kysely";
import type { AppDatabase } from "./schema.js";

const DEFAULT_CATEGORIES = [
  { name: "groceries", description: "supermarkets, daily food shopping" },
  { name: "food", description: "restaurants, eating out, ordering in, coffee" },
  { name: "fuel", description: "gas station, car fuel" },
  { name: "transport", description: "uber, public transport, taxis" },
  { name: "home", description: "furniture, home accessories, repairs" },
  { name: "bills", description: "electricity, rent, subscriptions" },
  { name: "health", description: "medicines, doctors, pharmacy" },
  { name: "entertainment", description: "cinema, games, events, fun" },
  { name: "other", description: "anything else that does not fit" },
];

export async function seedDefaultCategories(
  db: Kysely<AppDatabase>,
  categoriesCreated: boolean,
): Promise<void> {
  if (!categoriesCreated) {
    return;
  }

  const createdAt = new Date().toISOString();
  await db
    .insertInto("categories")
    .values(
      DEFAULT_CATEGORIES.map((category) => ({
        name: category.name,
        description: category.description,
        created_at: createdAt,
      })),
    )
    .execute();
}
