# Implementation Phases: Signal Expense Tracker MVP

The sequence is based on dependencies and risks. Each phase concludes with verifying a working increment before moving to the next.

## MVP Scope

- Single "Note to Self" conversation in Signal.
- Messages are classified by LLM as `expense`, `report`, or `ignore`; this also applies to bot response echoes, which the router identifies from content as `ignore` (without prefix filters).
- Categories and code identifiers are in English. Input can be in any language; `note` and `raw_text` preserve the message language. Signal responses are in English (fixed templates).
- LLM via Vercel AI Gateway (`AI_GATEWAY_API_KEY`), not via native `@ai-sdk/openai` / `@ai-sdk/anthropic` packages.
- Signal message reception in `MODE=json-rpc` via WebSocket `ws://…/v1/receive/{number}` (not HTTP long-polling).
- Durable `inbox`, leases, and recovery are out of scope for MVP; they belong to Phase 1 post-MVP.

## Phase 0: Signal Integration Verification

- [x] Task: Verify linked device and message reception.
  - Acceptance: Linked device in `MODE=json-rpc` receives a test message sent to self via WebSocket `ws://…/v1/receive/{number}`. Actual payload structure with `source` / `sourceNumber` and `timestamp` is verified. `AUTO_RECEIVE_SCHEDULE` is disabled.
  - Verify: Manually send a test message, receive payload, send reply, and verify that its echo is received. Do not commit real financial data or phone numbers into fixtures.
  - Files: No persistent files; temporary container and commands.
  - Depends on: None.

## Phase 1: Local Skeleton and SQLite

- [x] Task: Create minimal TypeScript project with configuration.
  - Acceptance: `package.json`, TypeScript, and `.env.example` define required dependencies, `AI_GATEWAY_API_KEY`, `LLM_PROVIDER`, `LLM_MODEL`, `SIGNAL_API_URL`, `SIGNAL_PHONE_NUMBER`. Missing required keys halt startup with a clear error message.
  - Verify: `npm run typecheck`.
  - Files: `package.json`, `tsconfig.json`, `.env.example`, `src/config.ts`.
  - Depends on: Phase 0.

- [x] Task: Add local expenses database.
  - Acceptance: `better-sqlite3` creates `expenses` table with planned schema, amounts are `INTEGER` in cents/groszy, and persistence uses transactions with `INSERT OR IGNORE`.
  - Verify: `npm test` covers insert, re-insert of a single message, and preserving amounts in cents/groszy.
  - Files: `src/db/connection.ts`, `src/domains/expenses/repository.ts`, `src/domains/expenses/repository.test.ts`.
  - Depends on: Project configuration.

## Phase 2: Expense Recognition and Persistence

- [x] Task: Implement model selection and Zod schemas.
  - Acceptance: A single function selects the model via Vercel AI Gateway (`openai/{model}` or `anthropic/{model}`). Router returns only `expense`, `report`, or `ignore`; separate expense schema uses only categories `groceries`, `food`, `fuel`, `transport`, `home`, `bills`, `health`, `entertainment`, `other`. Each LLM call retries once with the same provider and model.
  - Verify: `npm test` verifies rejection of invalid intent and out-of-schema expense as well as one retry on invalid LLM response; `npm run typecheck` passes.
  - Files: `src/llm/provider.ts`, `src/llm/generate.ts`, `src/routing/schema.ts`, `src/domains/expenses/schema.ts` (+ tests).
  - Depends on: Phase 1.

- [x] Task: Save correctly recognized expense.
  - Acceptance: Handler passes date and `Europe/Warsaw` to LLM, validates entire list before transaction, saves `note` and `raw_text`, and avoids write after one failed retry. Signal responses: `Saved N items` / `Message already saved`.
  - Verify: `npm test` checks transactional write of multiple items; manually test real examples for purchase, fuel, and relative dates.
  - Files: `src/domains/expenses/handler.ts`, `src/domains/expenses/parser.ts`, `src/domains/expenses/handler.test.ts`.
  - Depends on: Zod schemas.

## Phase 3: Report and Signal Worker

- [x] Task: Add report based exclusively on fixed SQLite queries.
  - Acceptance: Handler accepts only validated `period` and `group_by`, computes boundaries in `Europe/Warsaw`, uses parameterized SQL, and always groups output by `currency`. Response format in EN (`📊 Report: …`).
  - Verify: `npm test` verifies `this_month`, `last_month`, category grouping, and separate PLN and EUR sums.
  - Files: `src/lib/periods.ts`, `src/domains/reports/queries.ts`, `src/domains/reports/format.ts`, `src/domains/reports/handler.ts` (+ tests).
  - Depends on: Phase 1.

- [x] Task: Connect worker to Signal.
  - Acceptance: Single process subscribes to Signal via WebSocket, routes content to router, uses `switch` to save expense or send report, and `ignore` takes no action. Confirmation or report echo reaches router and resolves to `ignore` without prefix filtering. After failed router or handler validation and one retry, worker performs no action and replies with `Could not recognize that message.`; does not treat this as `ignore`.
  - Verify: Manually send in sequence: an expense, a report command, and a random note; confirm single insert, report with correct total, and no reply for note or bot echo. Simulate LLM response violating schema and confirm no insert plus unrecognized message reply.
  - Files: `src/signal/client.ts`, `src/signal/envelope.ts`, `src/worker.ts`, `src/worker/dispatch.ts`.
  - Depends on: Phase 0, Phase 2, and report.

## Phase 4: Deployment and Observability

- [x] Task: Package two containers for Raspberry Pi.
  - Acceptance: Docker Compose runs only `signal-cli-rest-api` and worker, both with `restart: unless-stopped` and Signal / SQLite volumes. Worker waits for healthy Signal. Signal port bound only to `127.0.0.1:8080` (QR / debug). Worker uses internal `SIGNAL_API_URL=http://signal-cli-rest-api:8080`.
  - Verify: `docker compose up --build -d`, restart both containers, and reprocess test expense without duplicate single item insert.
  - Files: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `tsconfig.build.json`.
  - Depends on: Phase 3.

- [x] Task: Add optional Langfuse tracing.
  - Acceptance: Each message produces one trace; router and expense parser are generations. Trace contains LLM prompt / response and Signal message text (for diagnostics). Missing keys disable tracing, and tracing errors only trigger `console.warn`.
  - Verify: Run worker without keys and with Langfuse keys; in both cases expense persistence and Signal reply function correctly.
  - Files: `src/tracing.ts`, `src/worker.ts`, `src/llm/generate.ts`, `.env.example`.
  - Depends on: Signal worker.

## Completed MVP

The MVP is complete after Phase 4 when, following container restarts, a single test expense message is saved once, the report displays correct sums per currency, and unsupported content and bot response echoes resolve to `ignore`.

Do not add durable inbox, CSV, voice, web dashboard, or self-hosted Langfuse before this. Revisit those only after confirming that the MVP is in active use.
