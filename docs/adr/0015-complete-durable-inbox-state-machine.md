# 15. Complete Durable Inbox State Machine and Delivery Recovery

Date: 2026-09-11

## Status

Accepted

## Context

ADR 0004 introduced the durable inbox, but the current implementation does not
complete the intended state machine:

- rows in `saved` state are not selected for delivery recovery;
- router and LLM failures can be converted into ordinary user-facing failures;
- `parsed_json` and the `analyzed` state are not used to make processing
  deterministic;
- domain persistence and the inbox state transition are separate operations;
- expired leases and exhausted retries do not have a complete recovery or
  terminal-state path.

As a result, a worker crash between persistence and Signal delivery can leave a
message permanently stuck, while technical failures can be acknowledged as if
they were successfully processed.

## Decision

We will complete the durable inbox as a three-phase state machine:

```text
pending -> analyzed -> saved -> confirmed
                         \-> failed
pending -----------------> ignored
pending/analyzed --------> saved (user feedback)
```

1. **Analyze phase**
   - Read and validate the original Signal payload.
   - Route the message and run the domain parser without applying business
     side effects.
   - Persist a versioned, discriminated parsed command in `parsed_json` and
     transition `pending` to `analyzed` under the lease token.

2. **Persist phase**
   - Read the persisted parsed command without calling the LLM again.
   - Apply the domain effect and transition `analyzed` to `saved`, including
     `response_text`, in one SQLite transaction.
   - For read-only domains, persist the generated report/category response in
     the same state transition even though there is no write-side domain
     effect.

3. **Deliver phase**
   - Treat `saved` rows as an inbox-backed outbox.
   - Send the persisted `response_text` without rerunning routing or domain
     handlers.
   - Transition `saved` to `confirmed` only when the send operation succeeds.
   - Signal delivery remains at-least-once: a crash after sending and before
     confirmation may produce a duplicate response on recovery.

4. **Error classification**
   - User or semantic input errors become persisted responses and may complete
     through `saved` to `confirmed`; this may be a direct `pending` or
     `analyzed` to `saved` transition when no domain command can be produced
     and no business side effect is needed.
   - Signal receive payloads are classified as inbound, self-echo, or
     irrelevant/invalid. A valid `dataMessage` takes precedence over
     `syncMessage.sentMessage`; self-chat `syncMessage.sentMessage` events are
     inbound only when their destination and source are the configured account
     and their source device is in the configured input-device allowlist.
     Historical
     normalized rows are checked against the device encoded in their legacy
     message key; unparseable self-account rows are quarantined for review.
   - New self-echo payloads are ignored before they enter the inbox. Historical
     `pending` and `analyzed` self-echo rows transition to `ignored` with a
     `self_echo` diagnostic and no LLM or domain processing. A historical
     `saved` self-echo transitions to terminal `failed` quarantine for manual
     review; its persisted domain effect is not rolled back or replayed.
   - Technical errors from the LLM, router, database, lease ownership, or
     Signal transport remain retryable and must not be converted into
     successful confirmation.
   - After the retry limit, transition the row to a terminal `failed` state
     with diagnostic information and support manual requeue.

5. **Leases and idempotency**
   - Claims and state transitions will be conditional on status, retry timing,
     lease expiry, and the current `lease_token`.
   - Lease updates must verify affected-row counts. Long-running processing
     will use an appropriate timeout or lease renewal.
   - The original payload will be stored in `raw_envelope`. Expense writes
     will use an explicit relationship to the inbox message and item index,
     with a migration for existing data.

6. **Schema migration**
   - The required status, diagnostic, idempotency, and index changes will be
     applied through explicit migrations/backfills; `ifNotExists` initialization
     alone is not considered sufficient for existing databases.

7. **Transaction abstraction**
   - Domain persistence functions will accept a query-creator abstraction
     compatible with both the normal Kysely database and a Kysely transaction.

## Consequences

### Positive

- A crash before delivery can recover from `saved` without repeating LLM work
  or domain side effects.
- Technical failures are retried instead of being acknowledged incorrectly.
- Parsed decisions are durable and replayable.
- Domain effects and inbox state cannot commit independently.
- Exhausted messages are visible as terminal failures rather than silently
  remaining pending.

### Negative

- Domain handlers must be split into analysis and persistence steps.
- The inbox schema requires an explicit migration and additional indexes.
- Signal delivery cannot be made fully exactly-once because the external send
  and SQLite confirmation are not one transaction.
- The state machine and error taxonomy add implementation and test complexity.

## Validation

The implementation must include tests for:

- recovery of `saved` rows without a second LLM call;
- Signal send failure and retry scheduling;
- router/LLM failures remaining retryable;
- rollback of domain effects and inbox transitions;
- stale and competing lease tokens;
- long-running lease recovery;
- transition to `failed` after the retry limit;
- raw-payload round trips and duplicate replay;
- self-echo filtering, legacy self-echo cleanup, and preservation of legacy
  normalized inbox payloads;
- fresh and migrated queue/reporting index presence;
- all supported routing intents.
