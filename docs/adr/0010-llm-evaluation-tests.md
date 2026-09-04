# 10. LLM Evaluation Tests

Date: 2026-09-04

## Status

Accepted

## Context

The core business logic of the application relies heavily on Large Language Models (LLMs) via the Vercel AI SDK (`ai`). Specifically, parsing natural language into structured intents (`routeMessage`) and expense details (`parseExpenses`) involves sending prompts to the LLM. 
Currently, the unit tests use `vi.mock("ai")` to mock the model's responses. While this approach keeps standard tests fast, deterministic, and free of charge, it leaves a significant gap: modifications to prompts or changes in the underlying model might degrade the parsing quality (e.g. failing to properly recognize a category or incorrectly parsing expense amounts).

## Decision

We have decided to introduce **LLM Evaluation Tests (Evals)** into our testing strategy.
1. Eval tests will invoke real LLM endpoints using the Vercel AI SDK.
2. They will be separated from standard unit tests using file naming (`*.eval.test.ts`).
3. They will be protected by an environment variable flag (`RUN_EVALS=true`) to prevent accidental, costly executions during routine local development or basic CI checks.
4. They will validate the prompt logic using a dataset containing edge-cases in both English and Polish (e.g. checking if "✅ Zapisano 1 wpis" is correctly routed as `ignore` to prevent bot feedback loops).

## Consequences

- **Pros:** We gain confidence when modifying prompts or swapping LLM models, knowing regressions will be caught by real-world test cases.
- **Cons:** Developers must ensure valid API keys (e.g., `AI_GATEWAY_API_KEY`) are present in their local `.env` file to run these tests. Evaluation tests can be slow (several seconds per LLM request) and incur minor API costs.
