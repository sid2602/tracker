# MVP Plan: Signal Expense Tracker

## Goal

You send a message to yourself in Signal, e.g. `groceries 15 PLN`, `gas station 15 PLN` or `generate expense report for this month`. The application recognizes the note type, saves the expense, or replies with a report. Random notes are ignored. Input can be in any language; bot responses are in English.

## Minimal Architecture

```text
Signal "Note to Self"
  -> signal-cli-rest-api (linked device, MODE=json-rpc)
  -> Node.js + TypeScript worker (WebSocket /v1/receive)
  -> AI SDK + Vercel AI Gateway router: expense | report | ignore
  -> switch:
       expense -> Gateway LLM expenses -> Zod -> SQLite -> Signal: "Saved N items"
       report  -> fixed SQL -> Signal: "📊 Report: …"
       ignore  -> no action

Worker --asynchronously--> Langfuse Cloud (LLM trace + content)
```

Docker Compose runs only two containers:

1. `signal-cli-rest-api` as a linked Signal device.
2. Node.js worker with application logic.

Containers have `restart: unless-stopped` and persistent volumes for Signal configuration and SQLite database file. Do not expose ports publicly. For the initial QR pairing, binding the API to `127.0.0.1:8080` and using an SSH tunnel is sufficient. The worker in Compose connects internally as `http://signal-cli-rest-api:8080`. Langfuse Cloud is not an additional container on the Raspberry Pi.

## Signal

In `MODE=json-rpc`, reception happens via WebSocket (HTTP long-polling does not work properly in this mode):

```text
ws://{host}/v1/receive/{number}
```

Set `MODE=json-rpc` so that `signal-cli` runs as a daemon. Do not set `AUTO_RECEIVE_SCHEDULE`, because a second receiver might consume messages before the worker.

Echoes of bot responses (e.g. `Saved …`, `📊 Report …`) reach the LLM router and must be classified as `ignore`. There is no separate prefix filter prior to the LLM. Sending responses: `POST /v2/send`.

## TypeScript Application

No Express, Fastify, n8n, or additional HTTP server. A single process is sufficient:

1. Receives message from Signal (WebSocket).
2. Skips events without content (typing, receipts).
3. Queries LLM router solely for note type: `expense`, `report`, or `ignore`.
4. Dispatches the full message to the handler selected by `switch`.
5. `expense` handler calls the detailed LLM, validates with Zod, and persists items in a single SQLite transaction.
6. `report` handler executes a secondary LLM call to extract parameters, computes dates, and executes a fixed SQLite query safely.
7. `ignore` handler exits with no action and no response.
8. Asynchronously logs LLM trace in Langfuse (when configured).
9. Uses `pino` for fast, structured, JSON-based logging across all components.
10. Shuts down gracefully on `SIGINT`/`SIGTERM` using `AbortController`, waiting for active processing to finish and safely closing SQLite.

Each LLM call has one retry using the same provider and model. If the router or expense handler still fails to return valid data, take no action and reply with `Could not recognize that message.`. Do not automatically switch GPT to Claude or vice versa.

Code structure (domains):

```text
src/
  config.ts
  worker.ts
  worker/dispatch.ts
  signal/client.ts, envelope.ts
  llm/provider.ts, generate.ts
  routing/
  domains/expenses/
  domains/reports/
  db/connection.ts
  tracing.ts
  lib/
```

## Intents and Dispatch

The router uses a small, closed Zod schema (for Gateway as a flat object returning only the `intent`):

```text
expense | report | ignore
```

The router does not assign categories nor execute SQL. Only the domain handlers (`expense` and `report`) receive the full text and execute their own secondary, detailed LLM prompts. This two-step routing architecture prevents the global router prompt from ballooning as new features are added.

The `report` handler executes a secondary LLM call to extract parameters, e.g. `period: this_month | last_month` and `group_by: total | category`. It computes date boundaries in `Europe/Warsaw` and executes predefined SQLite queries (built safely via Kysely). The LLM never returns raw SQL, column names, or arbitrary filters.

`ignore` is a valid, explicit router decision for a note with no supported action. Do not treat a Zod validation error as `ignore`.

## Data Model

Use `kysely` as a type-safe query builder over `better-sqlite3`. Store amounts in cents/groszy as `INTEGER`, not as `REAL`. Store currency as a 3-letter ISO 4217 code. Reports always group totals by `currency`; do not sum different currencies together.

```sql
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY,
  source_author TEXT NOT NULL,
  source_timestamp INTEGER NOT NULL,
  item_index INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'PLN',
  category TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  note TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (source_author, source_timestamp, item_index)
);
```

Insert records via `INSERT OR IGNORE`. The unique key fully protects a single expense from duplicate writes upon restart or redelivery, and `item_index` allows storing multiple expenses from a single message. For multi-item messages, re-parsing might alter the number or order of items; the complete guarantee for this scenario comes with frozen `parsed_json` in Phase 1.

First fetch and validate the entire list of expenses, and only then open a write transaction.

## Categories, Dates, and Language

For the MVP, keep a small, closed list of English identifiers in code:

```text
groceries, food, fuel, transport, home, bills,
health, entertainment, other
```

Pass the current date and `Europe/Warsaw` time zone into the detailed expense prompt. Absence of a date means today; support relative dates (e.g. `yesterday` / `wczoraj`) and dates specified in the text.

`note` and `raw_text` preserve the user's original message language. Signal responses are fixed in English, e.g.:

```text
Saved 1 item / Saved N items
Message already saved
Could not recognize that message.
📊 Report: this month / last month
```

## Swappable LLM

Use Vercel AI SDK with Vercel AI Gateway (`createGateway`):

```text
ai
```

A single function builds the model as `{provider}/{model}` based on configuration. The router and expense handler have separate, small Zod schemas for `generateObject`, but share the same model configuration:

```text
AI_GATEWAY_API_KEY
LLM_PROVIDER=openai | anthropic
LLM_MODEL
```

This allows manually switching GPT to Claude without altering application logic (via Gateway). Every router or handler result must pass Zod validation before executing an action.

Switching models cannot guarantee identical language understanding quality. Before switching, run a few real-world examples of `message -> expected JSON`; this suffices as a minimal regression test without building an evaluation framework.

## Langfuse

In the MVP, Langfuse is used for LLM observability. Each Signal message creates a single trace: the router is the first generation, and the expense handler is the optional second. Record metadata:

```text
model, provider, response time, tokens, validation result,
count of saved expenses, and error code
```

as well as diagnostics content: prompt and LLM response, Signal message text, and handler result. Absence of API keys disables tracing.

Add the modern Langfuse JS/TS SDK to the worker:

```text
@langfuse/tracing
@langfuse/otel
@opentelemetry/sdk-node
```

Configuration:

```text
LANGFUSE_PUBLIC_KEY
LANGFUSE_SECRET_KEY
LANGFUSE_BASE_URL=https://cloud.langfuse.com
```

Missing keys disable tracing; expense saving must not depend on them. The SDK exports traces asynchronously, so Langfuse outages do not block Signal, the LLM, or SQLite. Log such errors with `console.warn`; do not hide them in an empty `catch`.

Do not use Langfuse for dynamic prompt management, datasets, or automated evaluators at this stage. Prompts remain versioned in code.

Sources: [AI SDK Gateway](https://ai-sdk.dev/providers/ai-sdk-providers/ai-gateway), [Langfuse JS/TS SDK v5](https://langfuse.com/docs/observability/sdk/overview).

## Raspberry Pi and Privacy

A Raspberry Pi 4 or 5 with at least 2 GB RAM will handle this setup when the model runs via API. Do not run a local LLM on the same Pi in MVP: it will be slower and typically less accurate.

Signal encrypts transport, but the external LLM provider (via Gateway) and Langfuse Cloud receive expense content / prompts when tracing is enabled. Choose a local model or disable Langfuse when privacy takes precedence over diagnostics.

## Phase 1 after MVP: Reliable Processing

Goal: Once a command is durably received by the application, it must be processed until technical success without duplicate expense writes after crashes, restarts, or Signal redeliveries.

Literal "exactly once" delivery cannot be guaranteed from phone to Signal, LLM, and SQLite. `signal-cli-rest-api` does not document ACK/NACK or redelivery for `/v1/receive`. However, once saved to a local durable inbox, at-least-once processing and effectively-once expense persistence are achievable.

### Durable Inbox

Add an `inbox` table. Immediately upon receiving a Signal event, persist the raw payload to SQLite before triggering LLM, parsing, or sending responses.

```text
message_key UNIQUE
raw_envelope
status: pending | analyzed | saved | confirmed | ignored
parsed_json
response_text
attempts
next_attempt_at
lease_until
lease_token
received_at
```

Build `message_key` from immutable Signal event fields verified against live payloads, e.g. account + sender + sender device + timestamp. Do not deduplicate by content: two identical purchases may be valid.

The existing `UNIQUE(source_author, source_timestamp, item_index)` constraint in `expenses` remains a safeguard against duplicate item writes.

### Flow and Transactions

1. Signal receiver records the event as `pending` via `INSERT OR IGNORE`.
2. Worker atomically leases an available entry and invokes the router.
3. `ignore` sets status to `ignored`; `expense` invokes the detailed LLM, and `report` prepares report parameters.
4. Upon successful Zod validation, save the final `parsed_json` and status `analyzed`. Semantic errors store `{"outcome":"needs_attention","reason":"..."}` in `parsed_json`, record a clarification request in `response_text`, and set status to `saved` without taking ambiguous actions.
5. A separate transaction writes expenses or report results into `response_text` and sets status to `saved`.
6. For `saved`, the worker sends the stored Signal response and updates status to `confirmed`.

Saving `parsed_json` freezes the validated LLM decision. A crash after successful analysis will not re-invoke the model or alter the outcome, even if GPT is subsequently switched to Claude. `response_text` ensures that a retry of report confirmation will not recompute against modified data.

The `saved` status acts as a lightweight transactional outbox: within the same transaction as the performed action, the intent to send a single response is recorded. A separate `outbox` table is unnecessary as long as the sole side effect is a reply in the same Signal chat.

### Retry and Recovery

Run `recoverDue()` at startup and on a 30-second timer. Do not run recovery only prior to Signal subscription, as the WebSocket may wait indefinitely for the next message.

Technical errors (e.g. timeout, network loss, 429, 5xx, or temporary SQLite lock) leave the entry for retry. Increment `attempts`, set `next_attempt_at` with exponential backoff capped at a maximum interval, and continue retrying without an attempt limit.

A semantic error after one retry of the same model does not perform ambiguous actions automatically. The recorded response transitions through `saved -> confirmed` like any other Signal response.

### Leases and Stale Writers

Before working on a row, the worker atomically sets `lease_until` and a random `lease_token` via native `crypto.randomUUID()`. Every subsequent status update must condition the write on the same token.

```text
UPDATE inbox ... WHERE id = ? AND lease_token = ?
```

Once a lease expires, recovery can take over the entry. The token prevents a delayed LLM invocation from overwriting the result of a newer retry. Set the LLM timeout shorter than the lease duration (e.g. 30s timeout and 120s lease).

### Boundary Guarantees

- Messages stored in `inbox` will be retried across technical failures until processed.
- Expense writes are effectively-once: SQLite transactions and unique keys prevent duplicates.
- Signal confirmation is at-least-once: a crash after successful transmission but before updating to `confirmed` may send a second, harmless confirmation.
- A crash between the Signal event arrival and the initial `inbox` commit remains a window that cannot be formally closed without documented ACK from Signal. The durable inbox minimizes it to a single brief write.

### Raspberry Pi Durability

Move the SQLite volume to a USB SSD; do not keep the sole copy on an SD card. Use SQLite transactions, `journal_mode=WAL`, and `synchronous=FULL`. Add a UPS and encrypted backups to secondary media or via `rclone`; perform backups using SQLite's backup API rather than simply copying the active `.db` file.

## Further Extensions

In Phase 1, also record explicit `ignore` decisions in `inbox` to verify whether the router is systematically ignoring real expenses. Later, add CSV export, voice support, or a web dashboard as needed. Only consider self-hosted Langfuse on a separate machine:
it requires Web, Worker, PostgreSQL, Redis/Valkey, ClickHouse, and S3 storage, making it unsuitable as a minimal addition to this Raspberry Pi.

Do not add Python/FastAPI, n8n, Google Sheets, a separate Signal number, Whisper, a category management UI, or self-hosted Langfuse on the same Raspberry Pi right now. Also, do not introduce OpenRouter, LiteLLM, or custom provider adapters alongside Gateway.
