# 8. Category Descriptions for Few-Shot Prompting

Date: 2026-09-04

## Status

Accepted

## Context

In ADR 0007, we introduced dynamic expense categories managed via chat. This provided flexibility but also introduced a new challenge: when users create their own ambiguous categories (e.g., distinguishing between "food" and "entertainment" for a coffee shop visit), the LLM relies solely on the category name to guess the correct assignment.

To improve the accuracy of the LLM's classification, we need a way to provide it with context and examples for each category. This technique is known as few-shot prompting or detailed instruction prompting.

## Decision

We will add a `description` field to the `categories` table.
Users will be able to supply this description when adding a category via chat (e.g., "dodaj kategorię food, to znaczy restauracje, kawa, pyszne, kfc"). 
The router will extract this description, save it to the database, and inject it into the prompt whenever the LLM is asked to parse an expense.

The prompt injection will map categories like this:
- food (restauracje, kawa, pyszne, kfc)
- groceries
- transport (uber, paliwo, bilety)

## Consequences

**Positive:**
- Significantly reduces LLM hallucinations and incorrect category assignments by providing explicit user-defined rules.
- Allows users to maintain very specific and personalized accounting logic.

**Negative:**
- Requires a database schema migration on the `categories` table.
- Slightly increases the token count in the `expenses` LLM prompt, though the cost difference is negligible.
