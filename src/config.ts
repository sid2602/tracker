import { config as loadDotenv } from "dotenv";

const LLM_PROVIDERS = ["openai", "anthropic"] as const;

export type LlmProvider = (typeof LLM_PROVIDERS)[number];

export type Config = {
  llmProvider: LlmProvider;
  llmModel: string;
  openaiApiKey?: string;
  anthropicApiKey?: string;
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

  const llmModel = requireNonEmpty("LLM_MODEL", process.env.LLM_MODEL);
  const databasePath =
    process.env.DATABASE_PATH?.trim() || "./data/expenses.db";

  if (llmProviderRaw === "openai") {
    const openaiApiKey = requireNonEmpty(
      "OPENAI_API_KEY",
      process.env.OPENAI_API_KEY,
    );

    return {
      llmProvider: llmProviderRaw,
      llmModel,
      openaiApiKey,
      databasePath,
    };
  }

  const anthropicApiKey = requireNonEmpty(
    "ANTHROPIC_API_KEY",
    process.env.ANTHROPIC_API_KEY,
  );

  return {
    llmProvider: llmProviderRaw,
    llmModel,
    anthropicApiKey,
    databasePath,
  };
}
