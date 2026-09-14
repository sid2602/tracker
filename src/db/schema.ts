import type { Generated } from "kysely";

export interface ExpenseTable {
  id: Generated<number>;
  source_message_key: string | null;
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

export interface InboxTable {
  message_key: string;
  receive_sequence: number;
  raw_envelope: string;
  status:
    | "pending"
    | "analyzed"
    | "saved"
    | "confirmed"
    | "ignored"
    | "failed";
  parsed_json: string | null;
  response_text: string | null;
  attempts: number;
  next_attempt_at: number | null;
  lease_until: number | null;
  lease_token: string | null;
  last_error: string | null;
  failed_at: number | null;
  received_at: number;
}

export interface CategoryTable {
  name: string;
  description: string | null;
  created_at: string;
}

export interface TrainingEntryTable {
  id: Generated<number>;
  source_message_key: string | null;
  source_author: string;
  source_timestamp: number;
  item_index: number;
  occurred_on: string;
  exercise: string;
  set_index: number | null;
  reps: number | null;
  weight_grams: number | null;
  duration_seconds: number | null;
  kind: string | null;
  note: string;
  raw_text: string;
  created_at: string;
}

export interface AppDatabase {
  expenses: ExpenseTable;
  inbox: InboxTable;
  categories: CategoryTable;
  training_entries: TrainingEntryTable;
}
