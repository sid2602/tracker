# 20. Maintainable Application Workflow Test Harness

Date: 2026-09-12

## Status

Accepted

## Context

The first application workflow suite was implemented as one large
`src/worker/application-workflow.integration.test.ts` file. It proves the
important path from a synthetic Signal envelope through the real router,
parsers, domain handlers, repositories, and an isolated SQLite database to a
mocked outgoing response.

The single-file structure is difficult to extend safely:

- fixture setup, LLM scripting, Signal mocks, database helpers, scenarios, and
  assertions are mixed together;
- adding a scenario requires understanding unrelated domains and retry logic;
- repeated setup details obscure what each test is actually proving;
- a future change can accidentally make a test pass without asserting the
  complete domain outcome.

The suite is intentionally not a production E2E suite. It must not contact the
real Signal CLI, the production database, or the AI Gateway.

## Decision

Refactor the workflow tests into a small test-only harness and behavior-focused
test files.

### Test-only layout

Use a dedicated test subtree under `src/worker/application-workflow/`:

```text
src/worker/application-workflow/
├── harness.ts
├── expense-report.integration.test.ts
├── catalog-modification.integration.test.ts
├── routing.integration.test.ts
└── failure-recovery.integration.test.ts
```

The production build must explicitly exclude this subtree from `dist`; the
current build exclusion for `*.test.ts` does not exclude `harness.ts`. Type
checking must still include the subtree so test helpers and scenarios remain
strictly typed. The implementation must verify this with both `npm run build`
and `npm run typecheck`.

### Harness responsibilities

`harness.ts` owns all shared mechanics:

- create and destroy a fresh SQLite `:memory:` database;
- initialize the schema as test fixture setup, without testing migrations;
- create a deterministic `AppDeps` and test configuration;
- build authorized synthetic Signal envelopes;
- enqueue a message and process exactly one inbox item;
- script `generateStructured` by operation, validate outputs with the supplied
  Zod schema, validate relevant prompt context, and reject unexpected calls;
- capture and reset mocked `sendMessage` calls;
- expose focused assertions for confirmed, ignored, retryable, and saved states.

Individual scenario files should contain only:

1. domain-specific seed data;
2. the input message;
3. the scripted domain result;
4. business outcome and response assertions.

### Scenario ownership

- `expense-report.integration.test.ts`: expense creation and reports;
- `catalog-modification.integration.test.ts`: category and expense
  modification paths;
- `routing.integration.test.ts`: ignored messages and routing-only outcomes;
- `failure-recovery.integration.test.ts`: semantic feedback, LLM retry, and
  Signal delivery recovery.

Each `it` block should represent one user-visible workflow and should not
depend on another test or shared mutable state.

Because Vitest module mocks and the scripted LLM state are module-scoped, the
harness permits one active instance per Vitest module and rejects concurrent
instances explicitly. Scenario files may run in parallel through Vitest's file
isolation, but their scenarios must not use `it.concurrent`.

### ESM mock-order contract

Scenario files must not statically import `inbox.js`, router modules, domain
handlers, or other production workflow modules. `harness.ts` registers the
`generateStructured`, `sendMessage`, tracing, and logger mocks first, then
dynamically imports the workflow entry points. The harness exposes those
entry points to scenario files. This keeps Vitest's ESM mock hoisting
deterministic when new scenario files are added.

### Boundary policy

- Incoming Signal is represented by a synthetic envelope passed to
  `saveToInbox`.
- Outgoing Signal is represented by a mocked `sendMessage` recorder.
- LLM calls are deterministic scripted responses at the
  `generateStructured` boundary.
- Router, parsers, domain handlers, repositories, inbox processing, and
  formatting remain real.
- The database is real SQLite in memory, but never the user's database.

Migration, TCP transport, backpressure, process lifecycle, and model-quality
tests remain in their existing dedicated suites.

### Execution

`test:workflow` should target the dedicated workflow directory, using the
verified selector `vitest run src/worker/application-workflow`.
The old monolithic `src/worker/application-workflow.integration.test.ts` must
be removed during the refactor so `npm test` and `npm run verify` cannot run
the same scenarios twice. The default verification command must include the
workflow tests exactly once; eval tests remain separate.

## Consequences

### Positive

- New scenarios can be added to the relevant behavior file without navigating
  unrelated setup code.
- Test infrastructure changes are centralized in one harness.
- Each test still exercises the real application path and isolated persistence.
- Test failures identify a domain workflow instead of a line in a monolithic
  file.
- The suite remains deterministic, parallel-safe, and free of external
  network calls. Parallelism is supported between isolated Vitest files, not
  between concurrent scenarios sharing one harness module.

### Negative

- The harness becomes a maintained test API.
- The production build needs an explicit exclusion for the test subtree.
- Mocking module boundaries remains coupled to the current imports; a later
  production dependency-injection change would require revisiting the harness.
- Splitting files does not replace domain-specific unit tests or LLM evals.

## Alternatives considered

### Keep one integration test file

Rejected because fixture mechanics and scenario intent remain interleaved and
the file becomes harder to review as more paths are added.

### Mock the database

Rejected for the workflow suite. A fake Kysely database would hide repository
queries and transaction behavior. An in-memory SQLite database provides the
required isolation without using production data.

### Use a real Signal TCP server

Rejected for this suite because the goal is application path coverage. Signal
transport and reconnect behavior already have separate tests.

### Add production dependency injection first

Deferred. It would change runtime architecture and is not required to make the
test suite maintainable.
