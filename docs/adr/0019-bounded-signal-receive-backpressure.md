# 19. Bounded Signal receive backpressure

Date: 2026-09-12

## Status

Accepted

## Context

The raw Signal JSON-RPC client currently serializes payload persistence through
an ever-growing Promise chain in `src/signal/client.ts`:

```text
payload 1 -> retry forever -> payload 2 -> payload 3 -> ...
```

If SQLite is unavailable, the first payload keeps retrying indefinitely while
each subsequent `receive` line adds another closure to the in-memory chain.
The durable inbox protects payloads only after `saveToInbox` succeeds; it
cannot protect payloads that are still waiting in an unbounded receiver queue.

This worker is a self-hosted, single-user application. There is one configured
Signal account and one local SQLite inbox; this decision does not introduce
multi-user queues, per-user quotas, or global ownership concepts.

The existing durable inbox (ADR 0004 and ADR 0015) must remain the source of
truth for accepted payloads. A receiver-side overflow must not silently drop a
payload, because the raw JSON-RPC connection has no application-level
transaction with SQLite.

## Decision

Replace the unbounded Promise chain with one process-wide, bounded FIFO receive
dispatcher:

- use one persistence worker, preserving receive order for later inbox
  processing and semantics such as “last expense”;
- cap both buffered payload count and total input-buffer bytes;
- replace `readline` admission with an explicit newline-delimited JSON framer
  that stops parsing a chunk when queue capacity is full and retains the
  unprocessed bytes inside the bounded buffer;
- pause the socket when the bounded dispatcher or framer reaches capacity, and
  resume only after the FIFO worker makes capacity available;
- reject the connection as a protocol error when a single line or the
  aggregate unprocessed byte buffer exceeds its explicit limit; do not grow
  memory or silently truncate the line;
- never silently discard a payload already admitted by the framer;
- retain retry-until-persisted semantics for the head payload, with capped
  exponential delay, because dropping an undurable payload would risk message
  loss. The bounded FIFO and backpressure are the deliberate trade-off for
  preserving ordering and durability;
- preserve `INSERT OR IGNORE` idempotency in the durable inbox;
- add a durable monotonic `receive_sequence` to the inbox, assign it when a
  payload is accepted, and migrate/backfill existing rows deterministically;
  the migration rebuilds the existing table when necessary so the column is
  `NOT NULL` and protected by a `UNIQUE` constraint/index;
- scope idempotent insertion conflicts to `message_key` only, verify the
  inserted-row count, and treat any `receive_sequence` conflict as a technical
  error to retry rather than silently ignoring an admitted payload;
- select the inbox head by `receive_sequence ASC` and apply head-of-line
  retry gating, so a later modification cannot overtake an earlier pending
  expense and change the meaning of “last expense”;
- implement head-of-line gating as two steps: first select the oldest
  non-terminal row without filtering by retry eligibility, then check its
  lease and `next_attempt_at`; if the head is leased or waiting, do not claim
  a later row;
- create the dispatcher once outside the reconnect loop, so reconnects cannot
  multiply queue capacity or leave old retry chains attached to a replaced
  socket;
- when a socket closes, flush every complete line remaining in that
  connection's framer into the shared dispatcher before starting the next
  connection; only an incomplete final line is discarded, and it is never
  joined with bytes from the next generation;
- on shutdown, stop accepting new socket data first, then drain admitted
  payloads and retry timers before resolving the listener and destroying the
  database. The drain first flushes every complete line already held in the
  framer remainder into the bounded dispatcher; if the dispatcher is full, it
  waits for FIFO capacity instead of dropping those lines. Only an incomplete
  final line may be discarded. Graceful drain has no internal deadline
  because abandoning an undurable payload would violate the no-loss guarantee;
  an external forced process kill remains outside graceful-shutdown
  guarantees.

The dispatcher will expose explicit process-wide constants for maximum
buffered payloads, maximum line bytes, and maximum aggregate buffered bytes.
This application has only one receiving account, so no per-user quotas are
needed. The socket readable high-water mark and framer byte limits will be
chosen together so one already-delivered valid chunk fits inside the bounded
framer. A partial line from a closed socket is discarded as an incomplete
protocol frame and is never joined with the next connection's bytes; complete
admitted lines are never discarded. A line or transport chunk beyond the hard
protocol limit is explicitly rejected and logged; arbitrary oversized or
malformed frames are outside the no-loss guarantee because supporting them
would require a durable spool before SQLite. Tests will verify chunk
admission, FIFO ordering, pause/resume, reconnect ownership, complete
remainder flushing, partial-line isolation, overflow behavior, and graceful
drain without timer or socket leaks. Migration tests will cover a fresh
database, an old database with rows, rerunning an already completed migration,
constraint validation, and rollback after a forced migration failure. Inbox
tests will cover an older head waiting for retry while a newer row is ready.

No new tables, external dependencies, HTTP services, or changes to the
single-user/global-category model are introduced. The existing inbox table
does receive a new `NOT NULL UNIQUE` sequence column and index through an
explicit, atomic, idempotent migration. The migration detects an already
completed conversion, rebuilds/backfills/validates the table and creates its
constraint/index in one SQLite transaction, and rolls back as one unit after a
failure. The backfill uses `received_at ASC, message_key ASC` only as a
deterministic order for historical rows; it does not claim to recover their
original arrival order.

## Consequences

### Positive

- In-memory receive memory is bounded even while SQLite is unavailable.
- TCP socket backpressure combined with the bounded `Buffer` newline framer
  prevents the application from accepting an unlimited number of payloads into
  JavaScript memory.
- Receive order and “last expense” semantics remain deterministic across
  receiver retries and durable inbox processing.
- Payloads are not intentionally dropped before they reach the durable inbox.
- The durable inbox remains responsible for deduplication, retries after
  process restarts, and business processing.

### Negative

- When SQLite is down and the bounded capacity is full, Signal delivery slows
  until the database recovers.
- A payload that cannot be persisted for a long time still consumes one
  bounded worker slot and retry timer.
- A failing head payload can delay later payloads until SQLite recovers; this
  is the intentional durability/order trade-off instead of dropping data.
- The custom framer and graceful drain add lifecycle and byte-accounting
  complexity.
- Existing inbox rows require a sequence-column migration/backfill, and the
  head-of-line retry gate can reduce throughput during a prolonged outage.
- Unsupported oversized/malformed protocol frames may be lost when their
  connection is rejected; eliminating that boundary requires a durable spool,
  which is outside this change.
- TCP backpressure depends on the sender honoring socket flow control; the
  application still has a finite kernel buffer outside the explicit
  JavaScript limits.
