# 7. Dynamic Expense Categories

Date: 2026-09-04

## Status

Accepted

## Context

Originally, the Signal Expense Tracker used a statically defined list of expense categories (`EXPENSE_CATEGORIES` in `schema.ts`) to validate and route user expenses. 
While simple, this required modifying the codebase and restarting the application whenever a user wanted to add a new category (e.g., "subscriptions" or "pets") or remove an unused one.

To improve usability, we want to allow users to manage their categories directly via chat by adding, removing, or listing them.

## Decision

We will transition from a static in-code category list to a dynamic, database-backed list.

1. **Database Table**: A new `categories` table will be introduced in SQLite containing `name` (primary key) and `created_at` columns.
2. **Seeding**: On initialization, if the table is empty, we will seed it with the legacy default categories to ensure backward compatibility and a smooth migration.
3. **New Intent**: We will expand the LLM Router to recognize a new `category` intent for handling add/remove/list commands.
4. **Dynamic Schema**: The expense extraction logic will be updated to fetch the current list of categories from the database *before* making the LLM call, and it will dynamically construct the Zod schema (`z.enum(...)`) to enforce that the AI only selects from the currently available categories.

## Consequences

**Positive:**
- Users can personalize their expense tracking without developer intervention.
- The system becomes more flexible.
- The LLM gets an accurate, up-to-date list of allowed categories dynamically.

**Negative:**
- We add an extra database read query before every expense processing request (to fetch the categories). Given SQLite's speed, this performance hit is negligible, but it does add slight complexity to the domain handler.
- The Zod schemas for the Vercel AI SDK must now be built dynamically rather than statically exported, meaning we cannot just export `expenseResultSchema` as a constant.
