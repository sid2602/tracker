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

## Deployment (Moving to a new device)

When migrating the project to a new device (like a Raspberry Pi), ensure you copy the entire project directory, paying special attention to the secrets and configuration files:

1. **`.env` file**: Must contain all your API keys and configuration.
2. **`rclone.conf` file**: Must exist as a text file in the project root. 
   > **⚠️ CRITICAL DOCKER QUIRK:** If you delete `rclone.conf` and run `docker compose up -d`, Docker will automatically create an **empty folder** named `rclone.conf` instead of a file, which will break the Rclone container. Always ensure `rclone.conf` is copied over as a physical text file (even if it's empty) before starting Docker.

To start the system on the new device:
```bash
docker compose up -d
```
(This will automatically start the Signal client, the Node.js worker, the Ofelia scheduler, and the Rclone backup service).
