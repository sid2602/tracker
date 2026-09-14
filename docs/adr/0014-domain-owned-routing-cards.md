# 14. Domain-Owned Routing Cards

Date: 2026-09-11

**Note (2026-09-14):** Expense domain paths moved to `src/products/expenses/domains/<domain>/` (ADR 0023). Routing-card ownership and composition rules in this ADR still apply.

## Status

Accepted

## Context

The global router prompt in `src/routing/prompt.ts` currently contains both:

- global routing policy, including intent priority, multi-intent handling, and `ignore`;
- domain-specific intent descriptions, examples, and local rules.

Adding a new domain requires editing this central prompt in addition to updating the router schema and dispatcher. This makes domain growth harder to review and increases the risk of inconsistent or duplicated routing rules.

At the same time, routing cannot be fully decentralized. The router must resolve cross-domain boundaries such as `category` versus `report`, apply a deterministic priority for multi-intent messages, and keep the prompt small because it is a cheap first-stage LLM call running on a Raspberry Pi.

## Decision

We will use domain-owned routing cards composed by a central router prompt.

1. Each actionable domain (`expense`, `report`, `category`, `modification`) will export one typed, data-only routing card from `src/products/expenses/domains/<domain>/routing.ts` (originally `src/domains/<domain>/routing.ts`; relocated by ADR 0023).
2. A routing card will contain only domain-local information:
   - the intent's object and goal;
   - local semantic rules;
   - representative examples.
3. Cross-domain policy will remain centralized in `src/routing/prompt.ts`:
   - the five-intent output contract;
   - intent priority and multi-intent behavior;
   - `ignore` policy;
   - cross-domain contrastive examples;
   - best-effort handling of untrusted user-message content.
4. `src/routing/registry.ts` will explicitly register cards in priority order:
   `category`, `modification`, `report`, `expense`.
   Filesystem discovery and dynamic imports will not be used.
5. The prompt builder will accept the registry explicitly through:
   `getRouterPrompt(text, cards)`.
6. The actionable intent type will be derived from `RouterResult`, excluding `ignore`, so it does not become a second manually maintained intent union.
7. Prompt-size limits will be enforced:
   - at most five examples and 2,000 rendered characters per card;
   - at most 12,000 characters for the complete composed router prompt.
8. Raw user messages longer than 6,000 characters will be rejected explicitly before prompt composition. They will not be silently truncated.
9. Adding a future domain still requires coordinated updates to the router schema, `RouterResult`, dispatcher/handler, routing card, registry, global priority and cross-domain rules, evals, and tests.

## Consequences

### Positive

- Domain-specific routing knowledge is colocated with the domain that owns the behavior.
- The central prompt remains responsible for global consistency and ambiguous cross-domain cases.
- Adding a domain no longer requires inserting a large domain-specific section into a monolithic prompt.
- Explicit registration keeps startup behavior predictable and lightweight.
- Size limits protect the latency and token budget of the first-stage router.
- Explicitly rejecting oversized input avoids silently losing transaction details.

### Negative

- A new domain requires changes in both its own routing card and central routing integration points.
- The registry is intentionally explicit and must be updated manually.
- Routing behavior is split across domain cards and central policy, so ownership boundaries must be tested.
- The composed prompt adds a formatting layer that needs deterministic unit tests and LLM eval regression coverage.
- Very long Signal messages are rejected by the router rather than truncated.
