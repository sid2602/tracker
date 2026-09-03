import type Database from "better-sqlite3";
import type { Config } from "../config.js";

export type MessageContext = {
  sourceAuthor: string;
  sourceTimestamp: number;
  rawText: string;
};

export type HandlerResult =
  | { kind: "success"; message: string; insertedCount?: number }
  | { kind: "failure"; message: string; errorCode?: string }
  | { kind: "silent" };

export type AppDeps = {
  db: Database.Database;
  config: Config;
  now?: () => Date;
};
