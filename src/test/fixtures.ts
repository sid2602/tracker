import type { Kysely } from "kysely";
import type { Config } from "../config.js";
import { createTables } from "../db/bootstrap.js";
import { initSchema, openDatabase } from "../db/connection.js";
import type { AppDatabase } from "../db/schema.js";
import type { AppDeps } from "../worker/types.js";

const DEFAULT_TEST_CONFIG: Config = {
  aiGatewayApiKey: "test-gateway-key",
  llmProvider: "openai",
  llmModel: "gpt-4o-mini",
  databasePath: ":memory:",
  signalRpcHost: "signal-cli-not-used",
  signalRpcPort: 6001,
  signalPhoneNumber: "+15005550100",
  signalAllowedInputDeviceIds: [1],
  langfusePublicKey: null,
  langfuseSecretKey: null,
  langfuseBaseUrl: "https://cloud.langfuse.com",
};

export function createTestConfig(overrides: Partial<Config> = {}): Config {
  const config: Config = { ...DEFAULT_TEST_CONFIG };
  Object.assign(config, overrides);
  config.signalAllowedInputDeviceIds = [
    ...config.signalAllowedInputDeviceIds,
  ];
  return config;
}

export function createTestDeps(
  db: Kysely<AppDatabase>,
  options: {
    config?: Partial<Config>;
    now?: () => Date;
  } = {},
): AppDeps {
  const deps: AppDeps = {
    db,
    config: createTestConfig(options.config),
  };
  if (options.now) {
    deps.now = options.now;
  }
  return deps;
}

export function openTestDatabase(): Kysely<AppDatabase> {
  return openDatabase(":memory:");
}

export async function createTestDatabase(
  schema: "base" | "full" = "full",
): Promise<Kysely<AppDatabase>> {
  const db = openTestDatabase();
  try {
    if (schema === "full") {
      await initSchema(db);
    } else {
      await createTables(db);
    }
    return db;
  } catch (error: unknown) {
    await db.destroy();
    throw error;
  }
}
