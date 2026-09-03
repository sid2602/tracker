import type { Kysely } from "kysely";
import type { AppDatabase } from "../db/schema.js";
import type { Config } from "../config.js";

export type MessageContext = {
  sourceAuthor: string;
  sourceTimestamp: number;
  rawText: string;
  messageKey: string;
};

export type HandlerResult =
  | { kind: "success"; message: string; insertedCount?: number }
  | { kind: "failure"; message: string; errorCode?: string }
  | { kind: "silent" };

export type AppDeps = {
  db: Kysely<AppDatabase>;
  config: Config;
  now?: () => Date;
};
