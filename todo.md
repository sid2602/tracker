# TODO: Multi-Tracker Architecture on a Single Signal Number

## Purpose

Evolve the Signal Expense Tracker into a **multi-product** system so we can add a **training tracker** (and later other trackers) without:

- a second Signal phone number
- a second worker process
- mixing training data into expense tables
- bolting unrelated intents onto today’s expense-only router

This document is the working plan. **Do not implement until an ADR is written and approved.**

### Training (locked summary)

| Topic | Decision |
|-------|----------|
| Signal | One number; router picks `training.*` vs `expenses.*` |
| Table | **`training_entries` only** (no sessions table) |
| UX | Log **after each set** in separate messages; no start/end commands |
| Day | `occurred_on` on each row |
| “Workout” | Reconstructed in **reports** (by day ± optional time-gap display) |
| `kind` | Fixed format enum (`emom`, `strength`, …) — **not** expense `categories` |
| `exercise` | Free-text on the row — **no** catalog table in MVP |
| MVP intents | `training.log` + `training.report` |

### Roadmap (4 stages)

| Stage | Name | Done when (measurable) |
|-------|------|------------------------|
| **0** | ADR approved | ADR merged/accepted; open decisions in §14 resolved or explicitly deferred |
| **1** | Product shell (expenses only) | Layout + registry dispatch live; **expense behavior unchanged**; `npm run verify` + existing expense workflows/evals green |
| **2** | Training core | Set-by-set **log** + **day report** on one Signal number; training unit/eval/workflow green; expenses still green; no cross-table writes |
| **3** | Training harden | Set correction (`3x8` → `3 seria 7`) + safer mods/deletes; targeted evals/workflows green |

Do not start stage *N+1* until stage *N* exit checks pass. Details: **§9**.

---

## 1. Current state (`origin/main`)

### 1.1 What the app is today

The repository is a **single-product** personal bot: a Signal expense tracker.

High-level flow:

```text
Signal self-chat
  → signal-cli TCP JSON-RPC
  → durable inbox (pending → analyzed → saved → confirmed)
  → LLM router (intent)
  → domain analyze (LLM) + persist (SQLite)
  → Signal reply
```

### 1.2 Platform vs product (already latent)

**Platform-ish (largely product-agnostic today):**

| Area | Location | Notes |
|------|----------|--------|
| Process entry | `src/worker.ts` | Single Node worker (ADR 0001) |
| Signal client / receive queue | `src/signal/` | Bounded FIFO backpressure (ADR 0019) |
| Envelope auth | `src/signal/envelope.ts` | Self-only ingress (ADR 0016) |
| Durable inbox | `src/worker/inbox/` | Opaque `parsed_json`; analyze-then-persist (ADR 0004, 0015) |
| LLM gateway | `src/llm/` | Vercel AI SDK + Gateway |
| Handler result protocol | `src/worker/types.ts` | `success` / `failure` / `silent` |
| Shared utilities | `src/lib/` | dates, retry, messages, logger |

**Product (entire application semantics today):**

| Area | Location | Notes |
|------|----------|--------|
| Domains | `src/domains/{expenses,categories,reports,modifications}/` | Expense-only use cases |
| Router schema | `src/routing/schema.ts` | Flat enum: `expense \| report \| category \| modification \| ignore` |
| Router prompt | `src/routing/prompt.ts` | Explicitly “Signal expense tracker”; expense priority rules |
| Routing cards | `src/domains/*/routing.ts` + `src/routing/registry.ts` | ADR 0014 domain cards |
| Dispatch | `src/worker/dispatch.ts` | Hard-coded switches per intent |
| Analysis union | `src/worker/analysis.ts` | Versioned Zod union of the four expense intents |
| DB tables | `expenses`, `categories`, `inbox` | Expense catalog + monetary rows |
| Seeds | `src/db/seeds.ts` | Default grocery/food/… categories (ADR 0022) |

### 1.3 What ADR 0014 already solves — and what it does not

ADR 0014 (**domain-owned routing cards**) makes it easier to add another **expense-related** intent:

- domain exports a data-only routing card
- central registry lists cards in priority order
- central prompt owns cross-domain policy, ignore rules, contrastives

It does **not** define a boundary for a second product with different nouns, tables, and reporting semantics (training vs money). Adding `workout` as a fifth flat intent would fight the expense-centric global prompt and collide on generic names (`report`, `category`, `modification`).

### 1.4 Coupling hotspots for a second tracker

These must change for multi-product support:

- `src/routing/schema.ts`, `prompt.ts`, `registry.ts`
- `src/worker/dispatch.ts`, `analysis.ts`
- `src/db/schema.ts`, bootstrap, migrations
- domain folder layout under `src/domains/`
- router/domain evals and application-workflow tests
- docs (`architecture.md`, README naming)

These can stay conceptually stable:

- `src/signal/*`
- `src/worker/inbox/*` state machine
- `src/llm/*`
- `HandlerResult`, lease/retry/delivery/retention

---

## 2. Hard constraint: one Signal number

### 2.1 Decision

**One Signal number, one self-chat, one worker, one inbox, one SQLite file.**

Isolation between trackers is **not** done with another phone number or another process. It is done with:

1. namespaced product routing
2. separate business tables per product
3. fail-closed behavior when the product is ambiguous
4. optional explicit user overrides (prefix / mode)

### 2.2 Target ingress model

```text
1 Signal number (self-chat)
  → 1 durable inbox
  → 1 worker process
  → router selects PRODUCT + INTENT
  → product domain analyze / persist
  → product-owned tables
  → 1 reply channel (same chat)
```

### 2.3 Explicitly out of scope for v1

| Approach | Why not (for now) |
|----------|-------------------|
| Second Signal account | Operational overhead; worse UX for a personal bot |
| Second worker process | Unnecessary with one number / one TCP receive loop |
| Signal groups as product channels | Would require relaxing self-only auth (ADR 0016); larger product change |
| Separate DB files per product | Extra backup/ops complexity; one DB with separate tables is enough |

Groups or multi-chat routing can be revisited later; they are not required to ship training.

---

## 3. Target mental model

### 3.1 Two levels: Product → Domain intent

```text
Platform (signal, inbox, llm, worker shell)
  └── Product: expenses
        └── Domain intents: create | report | category | modification
  └── Product: training
        └── Domain intents: log | report | catalog | modification   (example)
  └── Product: <future>
        └── Domain intents: …
```

- **Product** = tracker / bounded context (expenses, training, …)
- **Domain intent** = use-case inside that product (create/log, report, catalog, modify)

### 3.2 Keep two-step LLM routing (ADR 0003), extend the first step

Still exactly two LLM stages for a normal message:

1. **Router (cheap classify)** → `{ product, intent }` or a namespaced intent string (+ `ignore`)
2. **Domain parser (detailed extract)** → Zod-validated structure for that use-case

Do **not** add a third LLM round-trip whose only job is “which tracker?”. On a Raspberry Pi that costs latency and tokens for little gain. Product selection belongs in the existing first-stage router.

### 3.3 Namespaced intents (required)

Do not reuse bare global names across products.

**Option A — flat namespaced strings (simple for Zod / evals):**

```text
expenses.create
expenses.report
expenses.category
expenses.modification
training.log
training.report
training.catalog
training.modification
ignore
```

**Option B — structured object:**

```ts
{ product: "expenses" | "training", intent: "create" | "report" | ... }
// plus top-level ignore
```

Either is fine if documented in the ADR. What matters:

- no colliding `report` / `modification` across products in one enum
- `ActionableIntent` / routing cards / analysis union stay derivable from one source of truth
- eval fixtures name the full intent clearly

### 3.4 Training MVP intents (decided direction)

| Intent | Purpose |
|--------|---------|
| `training.log` | Append one or more **set/entry** rows from a message |
| `training.report` | List/summarize entries (by day, exercise, period) |
| `training.modification` | Edit/delete prior entries (phase 3; optional in MVP) |

**Out of MVP:** exercise catalog domain, explicit session start/stop, `training_sessions` table.

Ship MVP with **log + report** first.

---

## 4. Target folder layout

### 4.1 Principle

```text
products/<tracker>/domains/<use-case>/
```

Platform code stays at `src/{signal,worker,llm,lib,db,routing}/`.  
Product code lives only under `src/products/`.

### 4.2 Proposed tree

```text
src/
  signal/                 # platform
  worker/                 # inbox + registry-driven dispatch
  llm/
  lib/
  db/
    connection.ts
    bootstrap.ts
    migrations.ts
    schema.ts             # AppDatabase = merge of all product table types
    seeds.ts              # expense seeds stay expense-scoped

  routing/                # cross-product router composition only
    registry.ts           # registers PRODUCTS (explicit imports)
    prompt.ts             # cross-product policy + compose product/domain cards
    schema.ts             # namespaced router output + ignore
    routing-types.ts
    router.ts

  products/
    expenses/             # today’s app, relocated
      index.ts            # ProductModule export
      routing.ts          # product-local priority + re-export domain cards
      db.ts               # ExpenseTable, CategoryTable (+ helpers if needed)
      domains/
        expenses/         # create (today’s “expense” intent)
        categories/
        reports/
        modifications/
          handler.ts
          parser.ts
          prompt.ts
          schema.ts
          repository.ts   # or queries.ts
          routing.ts      # RoutingCard (ADR 0014)
          index.ts
          *.test.ts
          *.eval.test.ts

    training/             # next tracker = new sibling folder
      index.ts
      routing.ts
      db.ts               # TrainingEntryTable only (no sessions table)
      domains/
        entries/          # training.log — set/entry writes
        reports/          # training.report — group by day (± time gaps)
        modifications/    # later: edit/delete entries
```

### 4.3 Mapping from today → after phase 1

| Today | After refactor |
|-------|----------------|
| `src/domains/expenses/` | `src/products/expenses/domains/expenses/` |
| `src/domains/categories/` | `src/products/expenses/domains/categories/` |
| `src/domains/reports/` | `src/products/expenses/domains/reports/` |
| `src/domains/modifications/` | `src/products/expenses/domains/modifications/` |
| `src/routing/registry.ts` imports 4 domain cards | imports `expensesProduct` (later also `trainingProduct`) |
| `src/db/schema.ts` owns expense tables inline | imports/re-exports from `products/expenses/db.ts` (+ others) |

Stage 1 is mostly a **move + wire-up**, not new user-facing behavior.

### 4.4 Adding a future tracker (checklist)

1. Create `src/products/<name>/`
2. Add `db.ts` with product tables
3. Add `domains/<use-case>/` using the existing domain file pattern
4. Export a `ProductModule` from `index.ts`
5. Register the product in `src/routing/registry.ts` (explicit import)
6. Merge table types into `AppDatabase`
7. Extend bootstrap/migrations
8. Add unit + eval + workflow coverage
9. Update cross-product router policy / contrastive examples

No changes to Signal ingress or inbox state machine for a normal new product.

### 4.5 What not to do with folders

- Do **not** add `src/domains/training/` beside expense domains without a product layer
- Do **not** keep “shared business domains” that reach into multiple products
- Do **not** use filesystem auto-discovery of products/domains (ADR 0014: explicit registry)
- Technical shared code (`dates`, `retry`, LLM helpers) stays in `src/lib` / `src/llm`
- Business logic for expenses must not import training repositories (and vice versa)

---

## 5. Contracts to introduce

Today `analyze*` / `persist*` / routing cards are conventions. Formalize them so N products do not mean N growing switches.

### 5.1 Keep: `RoutingCard` (domain-level, ADR 0014)

Each actionable domain still owns a data-only card:

- intent id (namespaced)
- object / goal
- local semantic rules
- representative examples
- size limits unchanged

### 5.2 Add: `ProductModule`

Conceptual shape (exact TypeScript to be decided in ADR/implementation):

```ts
type ProductModule = {
  id: "expenses" | "training" | string;
  // domain cards in product-local priority order
  routingCards: readonly RoutingCard[];
  // optional product-local priority notes for the global prompt composer
  // map namespaced intent → analyze / persist functions
  // contribution to MessageAnalysis Zod branches
  // contribution to DB types / seed hooks if needed
};
```

Responsibilities:

| Concern | Owner |
|---------|--------|
| Domain examples & local rules | Domain `routing.ts` |
| Priority among domains inside one product | Product `routing.ts` |
| Priority / contrast across products | `src/routing/prompt.ts` |
| Handler lookup | Product module + global registry |
| Table types | Product `db.ts` |

### 5.3 Replace hard-coded dispatch switches

`src/worker/dispatch.ts` today switches on four intents three times (`dispatchMessage`, `analyzeMessage`, `persistAnalyzedMessage`).

Target:

- registry lookup by namespaced intent
- `ignore` remains a platform-level outcome
- no per-product `import` sprawl inside dispatch beyond registering modules

### 5.4 `MessageAnalysis`

- Keep versioned discriminated union (`version: 1` today; bump if the envelope shape changes incompatibly)
- Inbox continues to store opaque JSON validated at read time
- Each product contributes its intent branches
- Persist path must remain deterministic and re-runnable after crash (ADR 0015)

### 5.5 Registration policy

- Explicit imports only
- Stable ordering in registry (documents product priority for multi-intent messages)
- Startup stays predictable on Pi (no dynamic glob imports)

---

## 6. Database design

### 6.1 Shared vs product-owned

```text
AppDatabase
├── inbox                 # shared platform (unchanged)
├── expenses              # product: expenses
├── categories            # product: expenses (user-managed catalog)
└── training_entries      # product: training (ONLY training business table in MVP)
```

| Layer | Approach |
|-------|----------|
| `inbox` | Shared. No `product` column; product lives inside `parsed_json` |
| Expense tables | Unchanged: `expenses`, `categories` |
| Training tables (MVP) | **Only** `training_entries` — no `training_sessions`, no `exercises` catalog |
| `AppDatabase` | Merge of product table types |
| SQLite file | One file (`DATABASE_PATH`; default today `./data/expenses.db`) |

### 6.2 Why not one polymorphic `items` table

Training rows are not expenses with a `type` flag. Reports, validation, and units differ. Prefer **separate tables per product**.

### 6.3 `kind` is not expense `categories`

| Concept | Product | What it is |
|---------|---------|------------|
| `categories` | expenses | User-managed catalog table; LLM maps purchases into it |
| `kind` | training | Small **fixed enum** on an entry (or derived at parse time): format/type of work (`strength`, `emom`, `amrap`, `for_time`, `cardio`, `mobility`, `other`) |
| `exercise` | training | Free-text exercise name on the entry (`podciąganie`), **not** a catalog table in MVP |

Do **not** put training kinds into `categories`. Do **not** require an `exercises` table to log sets.

### 6.4 Training model (decided): flat entries, no sessions

**Decision:** option “entries only”.

- No `training_sessions` table
- No mandatory “start training” / “end training” commands
- One Signal message → one or more **`training_entries`** rows (usually one set per message)
- A “workout” / “session” is **not stored**; it is reconstructed in reports

**Why:** user logs **immediately after each set** so they do not forget. Forcing a whole workout into one message does not fit. Explicit start/stop adds friction.

#### `training_entries` columns (MVP target)

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PK | |
| `source_message_key` | TEXT NULL | provenance (like expenses) |
| `source_author` | TEXT | |
| `source_timestamp` | INTEGER | ordering within the day |
| `item_index` | INTEGER | multiple parsed items in one message |
| `occurred_on` | TEXT | `YYYY-MM-DD` — which calendar day |
| `exercise` | TEXT | e.g. `podciąganie` |
| `set_index` | INTEGER NULL | set number within that exercise/day when known |
| `reps` | INTEGER NULL | |
| `weight_grams` | INTEGER NULL | INTEGER only (80 kg → `80000`) |
| `duration_seconds` | INTEGER NULL | cardio, holds, EMOM window pieces, etc. |
| `kind` | TEXT NULL | format enum; nullable if implied / unknown |
| `note` | TEXT | original language; may be `""` |
| `raw_text` | TEXT | source text for this item / message |
| `created_at` | TEXT | |

Useful unique/index patterns (finalize in implementation):

- unique `(source_message_key, item_index)` when key present (idempotent inbox persist)
- index `(occurred_on, source_timestamp)` for day reports
- index `(exercise, occurred_on)` for per-exercise queries

#### How “today’s training” is known

1. **Product:** router chooses `training.log` (not expenses) — same Signal number, semantic (or prefix) routing
2. **Day:** `occurred_on` from the message (“dziś” / “wczoraj” / explicit date), defaulting to today in `Europe/Warsaw`
3. **Workout grouping:** report query loads entries for that day ordered by `source_timestamp`; optionally **display** separate blocks when the gap between entries exceeds a threshold (e.g. 90 minutes). That gap logic is **presentation-only**, not a stored session

Two workouts on the same day = two clusters in the list (by time), still one flat table.

#### Logging UX this schema supports

| User style | Behavior |
|------------|----------|
| After each set: `podciąganie 8` then later `podciąganie 8` then `podciąganie 7` | Three rows; no start/end |
| Prescription then correction: `podciąganie 3x8` then `3 seria 7` | First message inserts three rows @ 8; follow-up **updates** set 3 → 7 (or inserts a corrective modification — prefer update of the targeted set) |
| EMOM / AMRAP / cardio | Same table; use `kind` + `duration_seconds` / `note` / `reps` as applicable — no per-format tables |
| Whole WOD in one message | Still fine: multiple `item_index` rows from one parse |

#### Explicitly rejected for training MVP

| Rejected | Why |
|----------|-----|
| `training_sessions` + start/stop | Extra friction; user does not want session lifecycle commands |
| One blob `result` string for the whole workout | Bad fit for set-by-set logging and “3rd set was 7” |
| Per-format tables (emom_table, …) | Overkill; `kind` + shared metrics is enough |
| Shared `categories` / early `exercises` catalog | Not needed to log; catalog can wait for phase 3 if autocomplete/modify needs it |
| Polymorphic shared `items` with expenses | Different domain shape |

### 6.5 Numeric discipline

- Money stays `INTEGER` cents/groszy
- Training: `reps`, `weight_grams`, `duration_seconds` as integers (no floats)

### 6.6 Transactions

Unchanged: multi-step writes (domain persist + inbox status) stay in SQLite transactions.

---

## 7. Routing & UX on one chat

### 7.1 Primary path: semantic product routing

Examples:

| User message | Expected route |
|--------------|----------------|
| `kawa 15 zł` | `expenses.create` |
| `How much did I spend on coffee this week?` | `expenses.report` |
| `podciąganie 8` | `training.log` |
| `podciąganie 3x8` | `training.log` |
| `3 seria 7` / `ostatnia 7` (in training context) | `training.log` or `training.modification` |
| `EMOM 12: thruster 15` | `training.log` |
| `Co robiłem na treningu wczoraj?` | `training.report` |

The global router prompt must include:

- all product/domain cards (composed, size-limited)
- **cross-product** priority for multi-intent messages
- contrastive examples across products (not only expense-internal contrasts)
- ignore policy for greetings / bot echoes / unsupported asks
- existing semantic-normalization / typo guidance (keep behavior quality)

### 7.1a Training UX principles (decided)

- **Primary habit:** log after each set in separate Signal messages — each message appends entry row(s)
- **No** required start/end workout commands
- **Day** comes from `occurred_on`; **product** from the router
- Reports answer “what did I do today?” by listing/grouping entries — not by reading a session row
- Optional prefixes (`t:`) remain an escape hatch only

### 7.2 Ambiguity: fail-closed

When product or intent is unclear (mixed goals, underspecified numbers, “80” alone):

- do **not** silently guess a product
- prefer `ignore` **or** a short clarification reply (product decision in ADR: silent ignore vs ask-user)
- never write to the wrong product tables

This matches the project’s fail-closed instinct (e.g. expense modifications ADR 0017).

### 7.3 Optional explicit overrides (safety net, not primary UX)

Useful on one number without mode-confusing UI:

| Mechanism | Example | Behavior |
|-----------|---------|----------|
| Prefix | `e: coffee 15` / `t: 3x squat 80` | Force product, then normal domain routing/parsing |
| Verbose prefix | `expense:` / `training:` | Same |
| Sticky mode | `mode training` / `mode expenses` | Until switched; store mode outside inbox row (design carefully; optional phase 2+) |

Overrides should be documented as **escape hatches**. Everyday use should work without them.

### 7.4 Multi-intent messages

Today expense routing uses a fixed priority (category → modification → report → expense).

Multi-product needs an explicit policy, for example:

1. Resolve product first (or treat cross-product mix as ambiguous)
2. Then apply product-local domain priority
3. Or: always fail-closed if two products appear in one message

**Recommendation to decide in ADR:** if a message clearly contains both an expense create and a training log, either:

- pick a documented global priority, **or**
- ask / ignore rather than partial-apply one side

Partial-apply is dangerous with durable inbox (one analysis blob, one reply).

### 7.5 Prompt size budget

ADR 0014 limits card size and total router prompt size. With two products:

- keep cards tight
- put only cross-product rules in the global prompt
- monitor eval failures caused by truncated policy
- reject oversized user messages (already done) rather than silently truncating

---

## 8. Approaches we consciously reject

| Approach | Why reject |
|----------|------------|
| Add `workout` to today’s flat intent enum | Leaves expense-centric priority/prompt; name collisions; poor extensibility |
| `src/domains/training` beside expense domains, no product layer | Fake extensibility; global router becomes a junk drawer |
| Polymorphic `items` + `type` column | Divergent schemas and reports; validation nightmare |
| Second Signal number / second worker | Violates the one-number constraint; extra ops on Pi |
| Filesystem product discovery | Non-deterministic startup; against ADR 0014 |
| Third LLM call only for product selection | Extra latency/cost; merge into stage-1 router instead |
| `training_sessions` + mandatory start/end | Friction; user logs set-by-set and does not want session lifecycle |
| One `result` blob per whole workout | Breaks set-by-set logging and “3rd set was 7” |
| Treating `kind` like expense `categories` | Format enum ≠ user-managed catalog |
| Exercise catalog table in MVP | Not needed to log free-text exercise names |

---

## 9. Implementation stages (measurable)

Each stage has: **goal**, **scope**, **exit checks** (commands / tests / observable behavior).
A stage is **done** only when every exit check passes. Do not start stage N+1 until stage N is done.

---

### Stage 0 — ADR approved

**Goal:** Lock architecture before code moves.

**Scope:**
- [ ] Write ADR: multi-product on one Signal ingress
- [ ] Include locked training model (`training_entries`, no sessions, set-by-set, `kind` ≠ categories)
- [ ] Resolve or explicitly defer every item in §14
- [ ] Get explicit approval

**Exit checks:**
- [ ] ADR exists under `docs/adr/` and is accepted
- [ ] §14 has no unresolved blockers for stage 1 (deferred items marked “later”)

**Out of scope:** any production code moves.

---

### Stage 1 — Product shell (expenses only)

**Goal:** Introduce `products/` + registry-driven dispatch **without** changing expense UX.

**Scope:**
- [ ] Add `ProductModule` + product registry
- [ ] Move `src/domains/*` → `src/products/expenses/domains/*`
- [ ] Registry-driven `analyze` / `persist` / dispatch for current expense intents
- [ ] Keep inbox analysis compatible (or migrate with tests)
- [ ] Update `architecture.md` for product layout
- [ ] Namespacing: follow ADR (rename now **or** defer string rename to stage 2)

**Exit checks:**
- [ ] `npm run verify` passes
- [ ] Existing expense application-workflow tests pass
- [ ] Existing expense/router unit tests pass
- [ ] Existing expense/router evals still pass
- [ ] Smoke: same expense messages still save/report/modify as before
- [ ] Structure check: a second product could be registered without touching Signal/inbox

**Out of scope:** `training_entries`, training intents, cross-product router copy.

---

### Stage 2 — Training core (log + report)

**Goal:** On the same Signal number, log sets across many messages and read them back by day — no start/end session commands.

**Scope:**
- [ ] `src/products/training/` + table `training_entries` only
- [ ] `training.log`: single-set messages + `NxR` expansion; multi-message same day
- [ ] `training.report`: list by day (and basic period); time order; optional time-gap **display** only
- [ ] Register training product; cross-product router contrastives
- [ ] Basic `kind` for strength + at least one non-strength example (EMOM or cardio)
- [ ] Unit + eval + workflow coverage for the above

**Exit checks:**
- [ ] `npm run verify` passes
- [ ] **Log:** ≥3 separate same-day messages (e.g. `podciąganie 8` then `8` then `7`) → ≥3 `training_entries` with the same `occurred_on`
- [ ] **Prescription:** `podciąganie 3x8` → exactly 3 rows @ 8 reps
- [ ] **Report:** day/yesterday query returns those entries in time order
- [ ] **Isolation:** expense message does not write `training_entries`; training message does not write `expenses`
- [ ] Training parser evals (EN + PL) for single-set + `NxR` pass
- [ ] Router evals include expense vs training contrasts and pass
- [ ] All stage-1 expense exit checks still pass

**Out of scope:** reliable `3 seria 7` after `3x8`, full modify/delete UX, exercise catalog, sticky mode (unless ADR required it).

---

### Stage 3 — Training harden

**Goal:** Trustworthy corrections/edits; training closer to expense quality bar.

**Scope:**
- [ ] Correction: after `podciąganie 3x8`, `3 seria 7` / `ostatnia 7` updates the right row
- [ ] Modifications/deletes for prior entries (fail-closed where needed)
- [ ] Richer reports only as needed (by exercise, simple aggregates)
- [ ] Broader `kind` only if evals/use demand it
- [ ] Exercise catalog only if free-text naming is still painful
- [ ] Trust-boundary / validation parity with expense domains where applicable

**Exit checks:**
- [ ] `npm run verify` passes
- [ ] **Correction workflow:** `3x8` then `3 seria 7` → reps `8,8,7` (or equivalent asserted DB/report outcome)
- [ ] **Modify/delete:** ≥1 happy path + ≥1 fail-closed case in tests
- [ ] Correction (+ mods if shipped) evals pass (EN + PL as relevant)
- [ ] Stage-2 exit checks still pass
- [ ] Expense `verify` + expense workflows still pass

**Out of scope:** a third product (repeat stage-1 wiring + stage-2 product work later).

---

### After stage 3

- Next tracker = `src/products/<name>/` + registry + tables + evals
- Prefixes / sticky mode only if real routing pain appears in use

---

## 10. Files / areas expected to change

### Will change

| Area | Why |
|------|-----|
| `src/domains/*` → `src/products/expenses/domains/*` | Product boundary |
| `src/products/expenses/{index,routing,db}.ts` | Product module surface |
| `src/routing/schema.ts` | Namespaced router output |
| `src/routing/prompt.ts` | Cross-product policy |
| `src/routing/registry.ts` | Register products, not only domain cards |
| `src/worker/dispatch.ts` | Registry lookup instead of growing switches |
| `src/worker/analysis.ts` | More intent branches over time |
| `src/db/schema.ts`, `bootstrap.ts`, `migrations.ts` | Product tables |
| Eval + workflow tests | Cross-product coverage |
| `architecture.md` / README | Describe multi-product system |

### Should stay stable

| Area | Why |
|------|-----|
| `src/signal/*` | One number ingress already correct |
| `src/worker/inbox/*` | Product-agnostic queue |
| `src/llm/*` | Shared generation helpers |
| Inbox status machine | Unchanged phases |
| Money-as-integer rule | Still applies to expenses |

---

## 11. Testing strategy (by stage)

Primary rule: **stage exit checks in §9 are the source of truth.** This section only maps *kinds* of tests.

| Stage | Must stay/pass | Must add |
|-------|----------------|----------|
| 0 | — | ADR review only |
| 1 | expense unit + workflow + existing evals; `npm run verify` | registry/dispatch unit tests; path/import updates |
| 2 | everything from stage 1 | `training_entries` migration tests; log/report unit tests; training parser evals (EN+PL); router cross-product evals; workflows: multi-message log, day report, table isolation |
| 3 | everything from stage 2 | correction (+ modify/delete) unit/workflow/evals |

### Commands

- Standard gate every code stage: `npm run verify`
- Evals: `SIGNAL_RPC_HOST=localhost SIGNAL_RPC_PORT=6001 npm run test:eval`
- Targeted: `RUN_EVALS=true SIGNAL_RPC_HOST=localhost SIGNAL_RPC_PORT=6001 npx vitest run <file>`

Do not call a stage done on green unit tests alone if its §9 workflow/eval exit checks are unchecked.

---

## 12. Documentation checklist (by stage)

- [ ] **Stage 0:** ADR accepted
- [ ] **Stage 1:** `architecture.md` describes `products/` layout; AGENTS.md still accurate for domain pattern under products
- [ ] **Stage 2:** README notes training exists (short); router/docs mention two products
- [ ] **Stage 3:** no extra docs required unless catalog/new UX ships
- [ ] Backups remain one SQLite file unless something large is added (should not)

---

## 13. Decisions already locked (training data model)

These are agreed for the plan / ADR draft — do not re-litigate unless requirements change:

1. **One Signal number** — product separation via router + tables, not a second phone
2. **Training storage** — single table `training_entries`; **no** `training_sessions`
3. **No start/end commands** required for workouts
4. **Set-by-set logging** is the primary UX (many messages → many rows)
5. **`kind` ≠ expense `categories`** — fixed format enum vs user catalog
6. **No exercise catalog table in MVP**
7. **“Session”** = report-time grouping by `occurred_on` (+ optional time-gap display), not a DB entity
8. **MVP intents** — `training.log` + `training.report` first

---

## 14. Open decisions still to lock in the ADR

Resolve before **stage 1** (or mark deferred with a stage):

| # | Decision | Blocks |
|---|----------|--------|
| 1 | Intent encoding: flat `expenses.create` vs `{ product, intent }` | Stage 1–2 |
| 2 | Namespace timing: rename expense intents in stage 1 vs at stage 2 | Stage 1 |
| 3 | Ambiguity UX: silent `ignore` vs clarification reply | Stage 2 |
| 4 | Cross-product multi-intent: priority vs fail-closed | Stage 2 |
| 5 | Overrides in stage 2: prefixes / none (sticky mode = later unless needed) | Stage 2 |
| 6 | Set correction in stage 2 vs **only stage 3** (recommended: stage 3) | Stage 2 scope |
| 7 | Time-gap display clustering in stage 2: on/off + threshold | Stage 2 |
| 8 | Exact `kind` enum for stage 2 minimum set | Stage 2 |
| 9 | Analysis `version`: keep `1` additive vs bump on rename | Stage 1–2 |

---

## 15. Verdict

Keep **one Signal number and one worker**. Split **platform** from **products**. Training stores flat **`training_entries`**; workouts are reconstructed in reports — no session start/stop.

**Execute in four stages only:**

0. ADR approved  
1. Product shell (expenses, behavior unchanged) — prove with `verify` + expense tests  
2. Training core (log + report + routing) — prove with multi-message log, day report, isolation, evals  
3. Training harden (corrections/mods) — prove with `3x8` → `3 seria 7` and fail-closed edits  

No stage is “done” without its §9 exit checks.
