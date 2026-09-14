# 18. Domain prompt trust boundaries

Date: 2026-09-11

**Note (2026-09-14):** Domain prompt files now live under `src/products/expenses/domains/<domain>/prompt.ts` (ADR 0023). Trust-boundary rules unchanged.

## Status

Accepted

## Context

The router prompt already places the raw Signal message in an encoded data
block, and expense modifications have an additional fail-closed validation
layer. Other domain prompts currently interpolate raw user text directly into
their instructions:

- `src/domains/expenses/prompt.ts`
- `src/domains/reports/prompt.ts`
- `src/domains/categories/prompt.ts`

The expense prompt also includes category names and descriptions loaded from
the database. These values can contain user-provided text and must not be
treated as trusted instructions.

JSON encoding and delimiters reduce accidental prompt confusion but are not a
security boundary. A model can still follow instructions embedded in a JSON
string. Therefore, prompt hardening must be paired with deterministic
validation before any database mutation.

This decision builds on ADR 0003 (two-step LLM routing), ADR 0010 (LLM
evaluation tests), ADR 0014 (domain-owned routing cards), and ADR 0017
(fail-closed expense modifications).

## Decision

All user-controlled values included in LLM prompts will be represented as
explicit, typed JSON data blocks. Prompt instructions remain outside those
blocks and explicitly state that embedded instructions are data and must be
ignored.

The application will:

- use one typed prompt-data serializer for raw messages and structured
  catalog data;
- escape the serializer's own begin/end markers;
- enforce separate limits for raw data blocks, catalog blocks, and complete
  prompts;
- fail closed without calling the LLM when serialization or input limits fail;
- never silently replace failed serialization with an empty value, `null`,
  `"none"`, or truncated data;
- map oversized raw user input at the router/domain boundary to
  `UserInputError` with safe user feedback;
- treat malformed or oversized database-sourced catalog data as an
  operational error, not as a user-input error;
- revalidate all LLM output before database mutation.
- reject known prompt-injection markers in report requests before calling the
  report parser LLM, returning safe user feedback instead of accepting a
  model-generated range or grouping;

Mutation-specific safeguards are required:

- category `remove` requires a deterministic, unambiguous remove command and
  a literal canonical category name present in the raw message; otherwise no
  category is removed and the user is asked for the canonical name;
- expense persistence revalidates item count, safe positive integer amounts,
  currency, calendar dates, bounded text, and current category membership;
- category add/remove payloads have action-specific required fields and
  bounded, control-character-free names;
- report parsing remains read-only, rejects known injection markers before the
  LLM call, and uses schema, date, range, and length validation.

Expense revalidation and insertion will run in one transaction in both the
legacy handler path and the durable inbox path. The shared operation will use
the transaction supplied by the caller and will not create nested
transactions.

The existing English translation behavior for category names and descriptions
is retained for compatibility. It is separate from the trust-boundary
mechanism. Destructive category removal intentionally requires a literal
canonical target because translated output cannot provide deterministic proof
of the requested target.

The router's existing maximum raw-message limit remains explicit. It will
produce the same safe `UserInputError` path as domain raw-input limits and will
not call an LLM.

## Scope

This ADR applies to prompt construction and validation only. It does not
introduce multi-user behavior, category ownership, HTTP services, new
database tables, or changes to the global category model.

## Consequences

### Positive

- Raw user text and user-controlled catalog content cannot be mistaken for
  prompt instructions by construction alone, and deterministic guards limit
  the impact if the model still follows embedded instructions.
- Oversized or malformed prompt data fails without sending incomplete context
  to an LLM.
- Destructive category operations and expense inserts have explicit
  application-side invariants.
- Prompt boundaries and validation behavior can be tested deterministically,
  while LLM evals provide supplementary regression coverage.

### Negative

- Some multilingual category-removal requests will require the canonical
  category name.
- Category descriptions and prompt data have explicit size limits.
- Additional validation and transaction work increases code and test surface.
- Prompt boundaries do not provide a formal security guarantee against model
  misbehavior; the system remains dependent on deterministic validation and
  conservative fail-closed behavior.
