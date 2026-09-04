# Signal Expense Tracker

A background worker process connecting to `signal-cli-rest-api` via WebSockets to categorize and track expenses via a Signal conversation. Built with TypeScript, Node.js, and Vercel AI SDK.

## Commands

### Normal Testing
Run the standard unit tests and type checks. This uses mocked responses for LLMs and executes extremely quickly, ensuring no regressions in architecture.
```bash
npm run verify
```

### LLM Evaluation Tests (Evals)
Since this project relies heavily on Large Language Models, we've implemented Eval Tests (`*.eval.test.ts`) that send real queries to the Vercel AI SDK Gateway.

**Important:** You must have `AI_GATEWAY_API_KEY` configured in your `.env` file. We also mock the mandatory Signal RPC credentials inline so `configSchema` doesn't block the tests.

To run ALL evaluation tests:
```bash
SIGNAL_RPC_HOST=localhost SIGNAL_RPC_PORT=6001 npm run test:eval
```

To run evaluation tests for a specific domain to save tokens (e.g. `modifications`):
```bash
RUN_EVALS=true SIGNAL_RPC_HOST=localhost SIGNAL_RPC_PORT=6001 npx vitest run src/domains/modifications/parser.eval.test.ts
```
