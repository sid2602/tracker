# 2. Use SQLite with Kysely

Date: 2026-09-03

## Status

Accepted

## Context

The system needs to store financial expenses, generate reports, and eventually handle idempotency/queues (Inbox). The database must be lightweight and easily backed up since it runs on a Raspberry Pi.

## Decision

We will use **SQLite** (via the `better-sqlite3` driver) as the sole database.
- We use **Kysely** as a type-safe SQL query builder instead of heavier ORMs like Prisma or TypeORM.
- Financial amounts must be stored as `INTEGER` representing cents/groszy to avoid floating-point inaccuracies.
- SQLite is configured to use `journal_mode=WAL` and `synchronous=FULL` for durability.
- Operations that require atomic guarantees (e.g., saving multiple parsed expenses from one message) must be wrapped in SQLite transactions.

## Consequences

- **Positive:** Extremely fast local access. Trivial to back up (just copy/snapshot the `.db` file). No external database service required. Low memory usage. Strong TypeScript typing for queries via Kysely.
- **Negative:** Limited to a single writer process (which aligns with our single Node.js worker architecture, so it's a non-issue).
