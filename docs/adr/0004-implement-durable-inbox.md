# 4. Implement Durable Inbox

Date: 2026-09-03

## Status

Accepted

## Context

The Signal Expense Tracker receives messages from `signal-cli`. The initial implementation processed the message synchronously right after receiving it: it parses the payload, asks the LLM via AI SDK, saves the result to the SQLite database, and replies to the user.

This approach has two major flaws:
1. **Crash during processing**: If the application crashes (e.g., power loss, container restart) *after* receiving the message from Signal but *before* fully processing and persisting it, the message is permanently lost.
2. **Double delivery (lack of idempotency)**: If Signal re-delivers a message or if the application receives the same payload twice (e.g., due to networking retries or restarting), it will be processed twice, potentially resulting in duplicate expenses being saved to the database.

To achieve reliable processing (as outlined in Phase 1 of the project goals), we need a mechanism that decouples message reception from processing, ensures that every received message is eventually processed successfully, and guarantees that each message is processed exactly once.

## Decision

We will implement a **Durable Inbox** pattern using a new `inbox` table in SQLite. 

The flow will be:
1. **Reception**: Upon receiving a message from the Signal WebSocket, the application immediately writes the raw payload into the `inbox` table with a `pending` status. This is done using `INSERT OR IGNORE` with a unique `message_key` (derived from the account, sender, device, and timestamp).
2. **Processing Loop**: A background asynchronous loop polling the `inbox` table will atomically lease a `pending` (or stalled) message using a random `lease_token` and a `lease_until` timestamp.
3. **Execution**: The worker processes the leased message (calls the router, domain handlers, LLM).
4. **Persistence & Reply**: 
   - After LLM validation, the state is updated to `analyzed`.
   - Expenses are saved in a database transaction, and the status changes to `saved`.
   - The application replies via Signal and updates the status to `confirmed`.
5. **Retries**: Any technical failure during execution increments an `attempts` counter and schedules the next retry using exponential backoff by setting `next_attempt_at`.

### Table Schema (`inbox`)
- `message_key` (TEXT, PRIMARY KEY / UNIQUE)
- `raw_envelope` (TEXT - JSON)
- `status` (TEXT - `pending`, `analyzed`, `saved`, `confirmed`, `ignored`)
- `parsed_json` (TEXT - JSON)
- `response_text` (TEXT)
- `attempts` (INTEGER)
- `next_attempt_at` (INTEGER)
- `lease_until` (INTEGER)
- `lease_token` (TEXT)
- `received_at` (INTEGER)

## Consequences

**Positive:**
- No messages will be lost if the application crashes during LLM processing or DB writes.
- Prevents duplicate processing of identical messages due to the unique `message_key`.
- Safely supports multiple concurrent processing routines (if needed) thanks to the atomic leasing mechanism.
- Provides a clear audit log of what was received and its processing state.

**Negative:**
- Adds complexity to the architecture (background loop, leasing, retry logic).
- Slightly increases processing latency due to the initial database write before processing starts.
- Requires maintenance of the `inbox` table (e.g., cleaning up old `confirmed` messages, though not strictly required immediately).
