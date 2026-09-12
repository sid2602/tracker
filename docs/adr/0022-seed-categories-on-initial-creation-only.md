# 22. Seed Default Categories Only When the Table Is Created

Date: 2026-09-12

## Status

Accepted

## Context

The categories table is currently seeded whenever it is empty. This preserves
the legacy defaults on a fresh database, but it also recreates all defaults
after a user intentionally removes every category and the worker restarts.

Dynamic category management must treat an empty catalog as a valid user state.
Initialization should not overwrite that state.

## Decision

Seed the legacy default categories only when the `categories` table is created
for the first time during initialization.

- Determine whether the table existed before running
  `CREATE TABLE IF NOT EXISTS`.
- Seed defaults only when the table was newly created.
- Do not seed an already existing empty table.
- Do not change category names, descriptions, ordering, or the existing
  category-management API.
- Keep the initialization operation idempotent for both fresh and existing
  databases.

## Consequences

### Positive

- Removing all categories remains effective across restarts.
- The empty catalog becomes a stable and explicit user state.
- No metadata table or additional schema column is required.

### Negative

- An old database with an existing but accidentally empty categories table will
  remain empty instead of being repaired automatically.
- Existing initialization tests must distinguish a newly created table from an
  existing empty table.
