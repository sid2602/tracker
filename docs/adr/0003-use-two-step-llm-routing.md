# 3. Use Two-Step LLM Routing

Date: 2026-09-03

## Status

Accepted

## Context

Users send free-form text messages to the bot via Signal. These messages can be random notes, explicit commands ("generate report"), or actual expenses ("coffee 15 PLN"). Using a single, massive LLM prompt to both classify the message and extract detailed data for all possible intents would become expensive, slow, and hard to maintain as new features are added.

## Decision

We implement a **Two-Step LLM Routing Architecture**:
1. **Global Router:** A fast, cheap LLM call that only returns a strict enum intent (`expense`, `report`, or `ignore`) based on Zod schema.
2. **Domain Handlers:** Only if the intent is recognized as actionable (e.g., `expense`), a second, detailed LLM prompt is executed by the specific domain handler. This prompt receives the current date, time zone, and specific schemas to extract detailed, validated structured data.

## Consequences

- **Positive:** Protects the system from ballooning prompt sizes. Random messages (`ignore`) are handled cheaply and quickly without attempting to extract non-existent expenses. Easier to add new intents in the future.
- **Negative:** Valid commands require two sequential LLM API calls, which slightly increases latency.
