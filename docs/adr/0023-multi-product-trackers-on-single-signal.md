# 23. Multi-Product Trackers on a Single Signal Ingress

Date: 2026-09-14

## Status

Accepted

## Context

The application is a single-product Signal expense tracker: one worker, one self-chat ingress, one SQLite database, and a flat router intent enum (`expense | report | category | modification | ignore`). Domain-owned routing cards (ADR 0014) scale **expense-related** intents, but they do not define a boundary for a second product with different nouns, tables, and UX (training vs money).

We want to add a **training tracker** (and later other trackers) while keeping:

- one Signal phone number and one self-chat
- one Node worker and one durable inbox
- one SQLite file
- two-step LLM routing (ADR 0003)
- analyze-then-persist inbox semantics (ADR 0004 / 0015)

Working plan and locked UX notes live in `todo.md`. This ADR is the architectural gate for Stage 0 before any product-layout or training code.

## Decision

### 1. Platform vs product

- **Platform** (product-agnostic): Signal client, envelope auth, durable inbox, LLM helpers, worker shell, shared libs.
- **Product** (bounded context): expenses today; training next; future trackers as siblings.
- Product code lives under `src/products/<product>/` with `domains/<use-case>/` inside.
- Platform code stays in `src/{signal,worker,llm,lib,db,routing}/`.
- Products register explicitly (no filesystem discovery), extending ADR 0014’s explicit-registry rule one level up.

### 2. One Signal number

- Product isolation is **routing + separate business tables**, not a second phone number, second worker, or Signal groups.
- Self-only ingress (ADR 0016) remains unchanged for this work.

### 3. Namespaced intents (encoding)

**Canonical** actionable intents are flat namespaced strings:

```text
expenses.create | expenses.report | expenses.category | expenses.modification
training.log | training.report
ignore
```

(`training.modification` arrives in Stage 3.)

Rationale: one Zod enum / string union stays simple for evals and `MessageAnalysis` discrimination. Structured `{ product, intent }` is rejected for now to avoid dual maintenance.

### 4. Namespace timing and legacy aliases

**Canonical IDs** (ProductModule handlers, routing-card `intent` fields, dispatch registry keys) are **always** the namespaced forms above — including in Stage 1.

**Stage 1 (product shell):**

- Introduce `ProductModule` + move expense domains under `src/products/expenses/`.
- Expense **routing cards use canonical** `intent` values (`expenses.create`, …). The composed router prompt therefore describes canonical intents.
- The **live LLM output schema in Stage 1 may still use legacy** enum strings for backward compatibility with existing evals/fixtures: `expense`, `report`, `category`, `modification`, `ignore`.
- Immediately after routing (before analyze/persist and before writing `parsed_json`), map legacy → canonical:

| Legacy router string | Canonical ID |
|----------------------|--------------|
| `expense` | `expenses.create` |
| `report` | `expenses.report` |
| `category` | `expenses.category` |
| `modification` | `expenses.modification` |
| `ignore` | `ignore` |

- If the Stage 1 LLM schema is switched early to canonical strings, the alias map is a no-op for those outputs but **must remain** for replay.
- **`inbox.parsed_json` / `MessageAnalysis.intent` store the canonical ID** from Stage 1 onward (after the alias map). New analyzed rows must not store bare `expense`.
- Replay of **pre-Stage-1** inbox rows that still contain legacy intents: `parseMessageAnalysis` (or a one-shot adapter) accepts legacy strings and normalizes to canonical before persist/dispatch. Covered by unit tests.
- Handler maps inside the expenses product are keyed by **canonical** IDs in Stage 1.

**Stage 2 (training core):**

- Switch the **live router LLM schema** to emit namespaced strings directly (plus `ignore`).
- Keep the legacy→canonical alias map for replay of any in-flight/old rows; do not bulk-rewrite historical inbox rows unless a test proves replay needs it.
- Register training intents `training.log` / `training.report` in the same registry.

### 5. ProductModule, dispatch, and registry uniqueness

Each product exports a `ProductModule` that provides at least:

- product id (string)
- routing cards (ADR 0014 style) in product-local priority order, with **canonical** `intent` ids
- analyze / persist handlers keyed by canonical actionable intent
- contributions to router registration

`src/worker/dispatch.ts` becomes registry lookup instead of growing per-intent switches. Cross-product priority and contrastives stay in `src/routing/prompt.ts`.

**Uniqueness (required):**

- At module load / worker startup (and in unit tests), validate that registered **product ids** are unique and registered **canonical intent ids** are unique across all products.
- Duplicate registration is a hard failure (throw / refuse to start). A second product must not silently shadow an existing route.
### 6. Database

Shared:

- `inbox` unchanged; no required `product` column (product is inside analysis JSON).

Expenses (unchanged conceptually):

- `expenses`, `categories`

Training (MVP / Stage 2):

- **only** `training_entries`
- **no** `training_sessions`
- **no** exercise catalog table in MVP

`kind` on training entries is a **fixed format enum**, not expense `categories`.  
`exercise` is free-text on the row.

Numeric discipline: INTEGER only (`reps`, `weight_grams`, `duration_seconds`, etc.).

### 7. Training UX (locked)

- Primary habit: log **after each set** in separate Signal messages; each message appends one or more `training_entries`.
- No mandatory start/end workout commands.
- Day = `occurred_on` (default today in `Europe/Warsaw`).
- “Workout/session” is **not stored**; reports reconstruct by day (optional time-gap display is deferred—see below).
- Stage 2 intents: `training.log`, `training.report`.
- Set correction (`3x8` then `3 seria 7`) is **Stage 3**, not Stage 2.
- Stage 2 minimum `kind` set: `strength | emom | cardio | other` (expand later if needed). Support strength thoroughly; include at least one non-strength path in evals.

### 8. Cross-product routing policy

- Stage-1 router still does **one** classify call (no extra “which product?” LLM hop).
- Ambiguity / unclear product: prefer **`ignore`** (silent), consistent with today’s unsupported-message behavior. Clarification replies are deferred unless real use proves silence is too harsh.
- Cross-product multi-intent in one message (expense + training): **fail-closed → `ignore`**.

**Durable inbox behavior for `ignore` / ambiguity (explicit):**

- The Signal envelope may still be **saved to the shared `inbox`** as usual (`pending` → …).
- Analyze may record intent `ignore` (or transition to terminal `ignored` per existing inbox policy).
- **No product business table** may be written (`expenses`, `categories`, `training_entries`, …).
- “Do not partial-apply” means: never persist an expense-only or training-only interpretation of a multi-product message into `parsed_json` as an actionable product intent.

**Prefixes / sticky mode:**

- **Unavailable in Stage 1 and Stage 2.** Semantic routing only.
- Revisit after Stage 2 only if production routing failures justify an escape hatch. Until then, docs and prompts must not describe prefixes as available.

**Stage 2 vs Stage 3 correction language:**

- Messages like `3 seria 7` / `ostatnia 7` after a prescription are **Stage 3** (`training.modification` or equivalent correction path).
- In Stage 2, if the router/parser cannot treat such a message as a plain new `training.log` set with unambiguous fields, the outcome must be **fail-closed `ignore`** (or a non-writing user-input error)—not a half-applied update.
### 9. Analysis versioning

- Prefer keeping `MessageAnalysis` `version: 1` with **additive** intent branches where possible.
- If namespaced rename makes old shapes incompatible for replay, bump version and teach `parseMessageAnalysis` to handle both during transition—covered by unit tests in Stage 1–2.

### 10. Testing expectations (gates)

Aligned with `todo.md` stages:

| Stage | Gate |
|-------|------|
| 0 | This ADR accepted; open decisions resolved or deferred |
| 1 | `npm run verify`; existing expense workflows + unit tests + existing evals green; expense UX unchanged |
| 2 | `npm run verify`; training unit + **parser evals (EN+PL)** + **router evals** (expense vs training); workflows: multi-message same-day log, `NxR` expansion, day report, **table isolation** (no cross writes); expense gates still green |
| 3 | Correction workflow (`3x8` → `3 seria 7`); modify/delete happy + fail-closed; evals as needed; prior gates still green |

Eval tests remain `*.eval.test.ts` (ADR 0010). Application workflows use the existing harness (ADR 0020).

### 11. Implementation stages

Execute only these four stages (details and checklists in `todo.md` §9):

0. ADR approved (this document)  
1. Product shell (expenses only)  
2. Training core (log + report)  
3. Training harden (corrections / mods)

## Consequences

### Positive

- Clear extension path for N trackers on one Signal number
- Training model matches set-by-set logging without session lifecycle friction
- Registry-driven dispatch avoids endless switches
- Explicit fail-closed cross-product rules protect durable inbox integrity
- Test gates are measurable per stage (verify, evals, workflows)

### Negative

- Stage 1–2 intent rename transition needs careful inbox/analysis compatibility tests
- Flat namespaced enum grows with every product/intent
- Silent `ignore` on ambiguity may frustrate until prefixes or clarify-UX are added later
- Report-time “session” clustering (time gaps) is deferred, so two workouts the same day appear as one chronological list until Stage 3+ polish

### Deferred (explicit)

| Item | Defer to |
|------|----------|
| Clarification replies instead of silent ignore | After Stage 2, if needed |
| Prefix / sticky product overrides | After Stage 2, if needed |
| Time-gap display clustering in reports | Stage 3+ or later |
| Set correction `3 seria 7` | Stage 3 |
| Exercise catalog table | Stage 3+ only if free-text hurts |
| Signal groups as product channels | Not planned |
| Second Signal number / second worker | Rejected |
| Structured `{ product, intent }` router object | Rejected for now |

### Supersedes conflicting draft text in `todo.md`

Where `todo.md` still mentions structured `{ product, intent }` router output, optional prefixes/sticky modes as current UX, clarification replies as an ambiguity option for early stages, or undecided cross-product multi-intent handling (historical §7.4), **this ADR wins**. Those passages are superseded.
## References

- `todo.md` — working plan, locked training summary, stage exit checks (must not contradict this ADR)
- ADR 0003 — two-step LLM routing
- ADR 0014 — domain-owned routing cards
- ADR 0004 / 0015 — durable inbox
- ADR 0010 — LLM evaluation tests
- ADR 0020 — application workflow test harness
- ADR 0016 — self-only Signal ingress
