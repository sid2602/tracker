import { Kysely } from "kysely";
import type { AppDatabase } from "../../db/schema.js";
import type { ModificationResult } from "./schema.js";

export async function findMatchingExpenses(
  db: Kysely<AppDatabase>,
  author: string,
  modification: ModificationResult,
) {
  let query = db.selectFrom("expenses").selectAll().where("source_author", "=", author);

  if (modification.target === "last") {
    query = query.orderBy("id", "desc").limit(1);
  } else if (modification.target === "id" && modification.id) {
    query = query.where("id", "=", modification.id);
  } else if (modification.target === "specific" && modification.searchCriteria) {
    if (modification.searchCriteria.category) {
      query = query.where("category", "like", `%${modification.searchCriteria.category}%`);
    }
    if (modification.searchCriteria.amountCents) {
      query = query.where("amount_cents", "=", modification.searchCriteria.amountCents);
    }
    if (modification.searchCriteria.keyword) {
      const kw = modification.searchCriteria.keyword;
      query = query.where((eb) =>
        eb.or([
          eb("note", "like", `%${kw}%`),
          eb("raw_text", "like", `%${kw}%`)
        ])
      );
    }
    query = query.orderBy("id", "desc").limit(5);
  } else {
    // If target is specific but no criteria, just return last 5 to ask user
    query = query.orderBy("id", "desc").limit(5);
  }

  return await query.execute();
}

export async function deleteExpense(db: Kysely<AppDatabase>, id: number) {
  await db.deleteFrom("expenses").where("id", "=", id).execute();
}

export async function updateExpense(
  db: Kysely<AppDatabase>,
  id: number,
  payload: { category?: string | null; amountCents?: number | null }
) {
  const updates: Record<string, any> = {};
  if (payload.category) updates.category = payload.category;
  if (payload.amountCents) updates.amount_cents = payload.amountCents;
  
  if (Object.keys(updates).length > 0) {
    await db.updateTable("expenses").set(updates).where("id", "=", id).execute();
  }
}
