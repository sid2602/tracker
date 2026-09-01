import { createGateway, type LanguageModel } from "ai";
import type { Config } from "../config.js";

const modelCache = new Map<string, LanguageModel>();

export function getModel(config: Config): LanguageModel {
  const modelId = `${config.llmProvider}/${config.llmModel}`;
  const cacheKey = `${modelId}:${config.aiGatewayApiKey}`;

  const cached = modelCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const gateway = createGateway({ apiKey: config.aiGatewayApiKey });
  const model = gateway(modelId);

  modelCache.set(cacheKey, model);

  return model;
}
