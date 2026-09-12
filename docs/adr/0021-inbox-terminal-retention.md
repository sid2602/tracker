# 21. Retain Terminal Inbox Records for 90 Days

Date: 2026-09-12

## Status

Accepted

## Context

The durable inbox keeps every received Signal message through its processing
lifecycle. Terminal rows in `confirmed`, `ignored`, and `failed` states are
currently never removed, so the SQLite database grows indefinitely.

The inbox remains useful for diagnosing recent failures and verifying delivery
recovery, but indefinite retention is unnecessary for this single-user worker.
The cleanup must not interfere with active processing or graceful shutdown.

## Decision

Retain terminal inbox rows for 90 days, measured from `received_at`.

- Delete only rows with status `confirmed`, `ignored`, or `failed`.
- Apply the same 90-day retention to `failed` rows.
- Never delete `pending`, `analyzed`, or `saved` rows through retention cleanup.
- Run cleanup as a separate, idempotent maintenance operation in bounded
  batches, outside the processing transaction for individual messages.
- The cleanup operation must use a SQLite transaction per batch and be safe to
  run repeatedly.
- Retention cleanup must not run during or block graceful inbox draining.
- No archive table is introduced; rows older than the retention window are
  permanently removed.

## Consequences

### Positive

- The inbox has bounded long-term storage growth.
- Recent terminal records remain available for operational diagnostics.
- Active or recoverable work cannot be removed by the retention operation.
- The operation is deterministic and can be tested against an isolated
  database.

### Negative

- Failed records older than 90 days cannot be inspected or manually recovered.
- The original receipt timestamp is used as the retention anchor even if a
  record spends a long time being retried.
- Cleanup adds a maintenance operation and another lifecycle concern to the
  worker.
