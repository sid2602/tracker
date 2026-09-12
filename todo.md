# Application workflow test plan

## Goal

Create a deterministic workflow test that simulates an incoming Signal message,
runs the real application path, persists into an isolated test database, and
captures the outgoing response without contacting Signal CLI, the real
database, or the AI Gateway.

The workflow is an integration test, not a production E2E test:

```text
synthetic Signal envelope
  -> saveToInbox
  -> processNextInboxItem
  -> real router/parser/domain handler/repository
  -> SQLite :memory: database
  -> mocked sendMessage response recorder
```

## Stages

### Stage 1 — workflow harness and expense/report paths

- [x] Add a reusable isolated workflow fixture.
- [x] Use `better-sqlite3` with `:memory:` and initialize the schema only as
      test setup.
- [x] Script `generateStructured` at the LLM boundary with Zod validation.
- [x] Capture outgoing `sendMessage` calls.
- [x] Cover expense creation, multiple expenses, and reports.
- [x] Run typecheck and the focused workflow tests.
- [x] Send the stage diff to the second agent for review.

### Stage 2 — category, modification, and ignore paths

- [x] Cover category add/list/remove through the workflow.
- [x] Cover expense update and delete through the workflow.
- [x] Cover ignored messages with no response or domain effect.
- [x] Keep each test isolated and deterministic.
- [x] Run the full standard verification.
- [x] Send the stage diff to the second agent for review.

### Stage 3 — critical error paths and command integration

- [x] Cover semantic/user-input feedback without a domain side effect.
- [x] Cover technical LLM failure remaining retryable.
- [x] Cover Signal send failure leaving a saved response for later delivery.
- [x] Add a focused `test:workflow` npm script.
- [x] Ensure the workflow suite never uses `DATABASE_PATH` or production data.
- [x] Run the full standard verification and focused workflow command.
- [x] Send the final diff to the second agent for review.

## Explicitly out of scope

- Signal CLI TCP framing, reconnects, and backpressure.
- SQLite migration, index, and schema durability testing.
- Production database files or Docker services.
- Real AI Gateway calls and LLM quality evaluation.
- Process-level worker lifecycle tests.

## Acceptance criteria

- [x] Every supported intent has a real application-path workflow test.
- [x] Tests use only disposable databases and mocked external boundaries.
- [x] Domain outcomes and captured responses are asserted.
- [x] Tests can run in parallel without shared mutable state.
- [x] `npm run verify` and `npm run test:workflow` pass.

## Maintainability refactor — ADR 0020

### Refactor stage 1 — shared harness and expense/report scenarios

- [x] Add `src/worker/application-workflow/harness.ts`.
- [x] Move expense and report scenarios into
      `expense-report.integration.test.ts`.
- [x] Keep ESM mock registration and dynamic workflow imports inside the
      harness.
- [ ] Review the stage with the second agent.

### Refactor stage 2 — remaining scenario files

- [x] Add catalog/modification scenarios.
- [x] Add routing/ignore scenarios.
- [x] Add failure/recovery scenarios.
- [ ] Review the stage with the second agent.

### Refactor stage 3 — remove monolith and wire tooling

- [x] Remove `application-workflow.integration.test.ts`.
- [x] Exclude the workflow subtree from `tsconfig.build.json`.
- [x] Update `test:workflow` to the verified directory selector.
- [x] Run `npm run build`, `npm run typecheck`, `npm run test:workflow`, and
      `npm run verify`.
- [x] Review the final refactor with the second agent.
