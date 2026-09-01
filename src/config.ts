import { config as loadDotenv } from "dotenv";

const LLM_PROVIDERS = ["openai", "anthropic"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type Config = {
  aiGatewayApiKey: string;
  llmProvider: LlmProvider;
  llmModel: string;
  databasePath: string;
};

function isLlmProvider(value: string): value is LlmProvider {
  return LLM_PROVIDERS.some((provider) => provider === value);
}

function requireNonEmpty(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(`Missing ${name}`);
  }

  return value.trim();
}

export function loadConfig(): Config {
  loadDotenv();

  const llmProviderRaw = process.env.LLM_PROVIDER ?? "";
  if (!isLlmProvider(llmProviderRaw)) {
    throw new Error(
      `Invalid LLM_PROVIDER="${llmProviderRaw}". Expected one of: ${LLM_PROVIDERS.join(", ")}`,
    );
  }

  const aiGatewayApiKey = requireNonEmpty(
    "AI_GATEWAY_API_KEY",
    process.env.AI_GATEWAY_API_KEY,
  );
  const llmModel = requireNonEmpty("LLM_MODEL", process.env.LLM_MODEL);
  const databasePath =
    process.env.DATABASE_PATH?.trim() || "./data/expenses.db";

  return {
    aiGatewayApiKey,
    llmProvider: llmProviderRaw,
    llmModel,
    databasePath,
  };
}
