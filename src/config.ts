import { config as loadDotenv } from "dotenv";
import { z } from "zod";

const LLM_PROVIDERS = ["openai", "anthropic"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

const configSchema = z.object({
  AI_GATEWAY_API_KEY: z.string().min(1),
  LLM_PROVIDER: z.enum(LLM_PROVIDERS),
  LLM_MODEL: z.string().min(1),
  DATABASE_PATH: z.string().default("./data/expenses.db"),
  SIGNAL_RPC_HOST: z.string().min(1),
  SIGNAL_RPC_PORT: z.coerce.number().int().positive(),
  SIGNAL_PHONE_NUMBER: z.string().min(1),
  LANGFUSE_PUBLIC_KEY: z.string().trim().min(1).nullable().default(null),
  LANGFUSE_SECRET_KEY: z.string().trim().min(1).nullable().default(null),
  LANGFUSE_BASE_URL: z.string().url().default("https://cloud.langfuse.com"),
});

export type Config = {
  aiGatewayApiKey: string;
  llmProvider: LlmProvider;
  llmModel: string;
  databasePath: string;
  signalRpcHost: string;
  signalRpcPort: number;
  signalPhoneNumber: string;
  langfusePublicKey: string | null;
  langfuseSecretKey: string | null;
  langfuseBaseUrl: string;
};

export function loadConfig(): Config {
  loadDotenv();

  // Convert empty strings to undefined to let Zod's default/nullable handle it
  const env = Object.fromEntries(
    Object.entries(process.env).map(([k, v]) => [k, v?.trim() === "" ? undefined : v])
  );

  const parsed = configSchema.parse(env);

  return {
    aiGatewayApiKey: parsed.AI_GATEWAY_API_KEY,
    llmProvider: parsed.LLM_PROVIDER,
    llmModel: parsed.LLM_MODEL,
    databasePath: parsed.DATABASE_PATH,
    signalRpcHost: parsed.SIGNAL_RPC_HOST,
    signalRpcPort: parsed.SIGNAL_RPC_PORT,
    signalPhoneNumber: parsed.SIGNAL_PHONE_NUMBER,
    langfusePublicKey: parsed.LANGFUSE_PUBLIC_KEY,
    langfuseSecretKey: parsed.LANGFUSE_SECRET_KEY,
    langfuseBaseUrl: parsed.LANGFUSE_BASE_URL,
  };
}
