# Active Task: Reliable Processing (Phase 1)

**Goal:** Once a command is durably received by the application, it must be processed until technical success without duplicate expense writes after crashes, restarts, or Signal redeliveries.

## 1. Durable Inbox Implementation
Add an `inbox` table. Immediately upon receiving a Signal event, persist the raw payload to SQLite *before* triggering LLM, parsing, or sending responses.

### Table Schema (`inbox`)
- `message_key` (UNIQUE) - built from account + sender + sender device + timestamp.
- `raw_envelope`
- `status` (Enum: `pending` | `analyzed` | `saved` | `confirmed` | `ignored`)
- `parsed_json`
- `response_text`
- `attempts`
- `next_attempt_at`
- `lease_until`
- `lease_token`
- `received_at`

## 2. Transaction Flow
1. Signal receiver records the event as `pending` via `INSERT OR IGNORE`.
2. Worker atomically leases an available entry (using `lease_until` and `lease_token`).
3. Invokes the router and domain handlers.
4. Upon successful validation, save `parsed_json` and set status to `analyzed`. (Semantic errors are recorded as `{"outcome":"needs_attention", ...}`).
5. A separate transaction writes expenses or report results and sets status to `saved` along with the `response_text`.
6. Finally, send the Signal response and update status to `confirmed`.

## 3. Retry and Recovery Mechanisms
- Run `recoverDue()` at startup and on a 30-second timer.
- Technical errors increment `attempts` and set `next_attempt_at` with exponential backoff.
- Leases: Before working on a row, atomically set `lease_until` and a random `lease_token`. Every subsequent status update must condition the write on the same token.

## Acceptance Criteria
- [ ] `inbox` table is created and integrated into Kysely types.
- [ ] Signal WebSocket listener immediately writes to `inbox` instead of directly processing.
- [ ] Background loop processes `pending` items safely with leases.
- [ ] Retries function correctly for LLM timeouts/failures.
- [ ] No duplicate expenses are written when a message is processed twice (enforced by inbox state and existing unique constraints).
