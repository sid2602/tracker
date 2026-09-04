# AI Assistant Instructions (agents.md)

You are an expert TypeScript/Node.js engineer assisting with the development of the "Signal Expense Tracker" project.

## Core Architectural Rules
Always adhere to these rules when modifying or proposing code. Do not suggest alternatives unless explicitly asked by the user.

1. **Stack & Environment:**
   - **Language:** TypeScript running on Node.js (via `tsx`).
   - **No HTTP Frameworks:** This is a background worker process connecting to `signal-cli-rest-api` via WebSockets (`MODE=json-rpc`). Do not add Express, Fastify, or any HTTP servers.
   - **Environment:** The app runs on a Raspberry Pi using Docker Compose. Keep memory and CPU footprint minimal.

2. **Database:**
   - **Driver & Builder:** Use `better-sqlite3` and `kysely`. Do NOT use Prisma, TypeORM, or other ORMs.
   - **Types:** Always store financial amounts as `INTEGER` (cents/groszy) to prevent float precision issues.
   - **Durability:** Always use SQLite transactions for multi-step data persistence (e.g., saving multiple expenses or updating inbox state).

3. **LLM & AI Integration:**
   - **SDK:** Use the Vercel AI SDK (`ai` package).
   - **Gateway:** Use Vercel AI Gateway for LLM provider abstraction. Do not import `@ai-sdk/openai` or `@ai-sdk/anthropic` directly.
   - **Routing:** Maintain the two-step routing architecture. Step 1: Router identifies intent. Step 2: Domain handlers execute detailed LLM prompts.
   - **CRITICAL**: Whenever you add a new domain or feature, you MUST remember to update both the router schema (`src/routing/schema.ts`) AND the router prompt (`src/routing/prompt.ts`) to explicitly describe the new intent to the LLM.

4. **Testing & Validation:**
   - Use `vitest`. Ensure high test coverage for any new logic (especially parsers, routers, and DB operations).
   - **CRITICAL (Unit Tests)**: Whenever you create a new domain, file, or feature, you MUST proactively write unit tests for it. Mimic the existing test structure (e.g. `*.test.ts`). Do not skip writing tests.
   - **CRITICAL (Eval Tests)**: Any modifications to AI Prompts or new AI parsers MUST be covered by LLM Evaluation Tests (`*.eval.test.ts`). These tests verify that the model correctly parses a wide range of user messages (in English and Polish).
     - Standard test run (`npm run verify` or `npm run test`) automatically ignores `.eval.test.ts` files to save AI Gateway tokens.
     - To run all Eval tests: `SIGNAL_RPC_HOST=localhost SIGNAL_RPC_PORT=6001 npm run test:eval`
     - To run Eval tests for a specific domain: `RUN_EVALS=true SIGNAL_RPC_HOST=localhost SIGNAL_RPC_PORT=6001 npx vitest run src/domains/modifications/parser.eval.test.ts`
   - After making code changes, ALWAYS run `npm run verify` to ensure types and tests pass before declaring the task complete.

5. **Code Structure (Domain Pattern):**
   - Every new feature must be isolated as a separate domain in `src/domains/`.
   - Strictly maintain the separation of concerns by creating dedicated files within a domain: `handler.ts`, `schema.ts`, `parser.ts`, `repository.ts`.
   - Do NOT dump all logic into a single massive `index.ts` file.

## Anti-Patterns (What NOT to do)
To prevent common AI hallucinations and bad habits, **NEVER** do the following in this project:
- **No HTTP Servers:** Do NOT install or suggest `express`, `fastify`, `hono`, or any HTTP server. The app is strictly a WebSocket client/worker.
- **No Heavy ORMs:** Do NOT suggest or use `Prisma`, `TypeORM`, or `Drizzle`. Stick exclusively to `kysely` + `better-sqlite3`.
- **No Floats for Money:** Do NOT use `FLOAT`, `REAL`, or `DECIMAL` for financial amounts. Always use `INTEGER` (cents/groszy).
- **No LangChain:** Do NOT use `langchain`, `langgraph`, or native `@ai-sdk/openai` packages. All LLM calls must go through Vercel AI SDK Gateway.
- **No `console.log`:** Do NOT use `console.log()`, `console.info()`, etc. Use the structured `pino` logger exclusively, as this runs as a background daemon.
- **No Unsafe DB Writes:** Do NOT write multiple `INSERT`/`UPDATE` statements without wrapping them in a database transaction (`db.transaction()`).
- **No Translating User Input:** Do NOT translate the user's `note` or `raw_text` into English. Save it in the database exactly in the original language. Only system responses are in English.
- **No Type Cheating:** Do NOT use `any` types. Do NOT use `@ts-ignore`, `@ts-expect-error`, or disable TypeScript checks in any way. Code must be 100% strictly typed.

## Architecture Decision Records (ADR)
This project uses Architecture Decision Records to track important technical decisions.
They are located in the `docs/adr/` directory.

**CRITICAL RULE:**
Whenever you are asked to implement a feature that involves an architectural change, a new table schema, a new external dependency, or a change in the data flow (e.g., adding a Durable Inbox), you **MUST**:
1. Check the existing ADRs in `docs/adr/`.
2. Propose or write a new ADR document (e.g., `0005-implement-durable-inbox.md`) explaining the Context, Decision, and Consequences of the change.
3. Wait for user approval on the ADR (or ask if they want you to create it) before writing the code.
