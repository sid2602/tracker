# 17. Fail-closed expense modifications

Date: 2026-09-11

## Status

Accepted

This ADR supersedes the selector and fallback behavior described in ADR 0009.
The rest of ADR 0009 remains in effect.

## Context

ADR 0009 introduced natural-language expense modifications with an ID
fallback. The implementation currently permits incomplete selectors to fall
back to recent expenses. This is unsafe for destructive operations because a
single broad match can be deleted or updated even when the user did not
identify it unambiguously.

The modification parser also describes relative dates such as "yesterday" and
"the first one today", but it does not persist the resolved date or selection
operator. Category updates are not checked against the global category
catalog, and the legacy handler path does not wrap its full resolution and
mutation flow in a transaction.

## Decision

Expense modifications will fail closed.

- `target: "last"` means the latest expense saved by the message author and
  cannot contain additional selector fields.
- `target: "id"` requires a positive safe integer ID and cannot contain
  search criteria or a positional selector.
- `target: "specific"` requires at least one real criterion: exact date,
  category, amount, or keyword.
- A `selection` of `first` or `last` is an operator over filtered
  `specific` results, ordered by expense ID. It is not itself a search
  criterion.
- Relative dates are resolved from the application reference date in the
  configured time zone and persisted in the parsed command as `occurredOn`.
- Ambiguous results never mutate data. They return candidate IDs and require
  the user to choose one.
- Deletion and update statements always scope by both expense ID and
  `source_author`, and affected-row counts are checked.
- Category updates use the canonical trimmed lowercase name and require an
  existing category from the global catalog.
- Selection, validation, and mutation run in one transaction. The durable
  inbox path uses its existing transaction; the legacy handler path wraps the
  same operation without nesting transactions.
- Semantic validation failures use `UserInputError` so the durable inbox can
  persist and deliver a precise user-facing message.
- Modification prompts delimit the raw user message as untrusted data.

This decision does not introduce multi-user category ownership, report
scoping changes, or stable ID/AUTOINCREMENT changes.

## Consequences

### Positive

- Incomplete or ambiguous LLM output cannot silently select a different
  expense.
- Relative-date requests have deterministic, testable semantics.
- Category updates cannot create values outside the configured catalog.
- Domain effects and selector validation remain atomic in both processing
  entry points.

### Negative

- Some previously accepted vague modification messages now require
  clarification.
- The modification schema, prompts, and evaluation suite become more
  detailed.
- Existing historical expenses with legacy category casing are matched
  case-insensitively but new category updates are stored canonically.
