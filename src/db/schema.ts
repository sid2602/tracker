import type { Generated } from "kysely";

export interface ExpenseTable {
  id: Generated<number>;
  source_author: string;
  source_timestamp: number;
  item_index: number;
  amount_cents: number;
  currency: string;
  category: string;
  occurred_on: string;
  note: string;
  raw_text: string;
  created_at: string;
}

export interface AppDatabase {
  expenses: ExpenseTable;
}
