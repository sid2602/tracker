# 9. Expense Modifications (Undo / Delete)

Date: 2026-09-04

## Status

Accepted

## Context

Currently, the application allows users to record expenses via natural language but provides no mechanism to correct mistakes (e.g., typos in amounts, wrong categories, or accidental entries). Since the application operates solely through a Signal messaging interface without graphical UI elements like "Edit" or "Delete" buttons, we need a natural and reliable way for users to modify or delete past expenses.

The user requested the ability to undo specific past expenses, for instance when sending 3 messages and wanting to delete the 1st or 2nd one.

## Decision

We will implement a hybrid approach: **Natural Language Referencing** backed by an **ID fallback**.

1.  **Router Extension (`src/routing/`)**:
    *   Add a new `modification` intent to `routerLlmSchema` and the routing prompt.
    *   This intent will capture any requests to delete, remove, undo, or change an existing expense.

2.  **New Domain (`src/domains/modifications/`)**:
    *   Create a dedicated domain to handle `modification` intents.
    *   **LLM Extraction (`schema.ts`, `prompt.ts`)**: Extract the user's intent into structured data:
        *   `action`: `"delete"` | `"update"`
        *   `target`: `"last"` (e.g., "cofnij") | `"specific"` (e.g., "usuń wczorajsze paliwo") | `"id"` (e.g., "usuń #42")
        *   `searchCriteria`: Optional filters (category, amount, keyword) if `target` is `"specific"`.
        *   `id`: Optional ID if `target` is `"id"`.
        *   `updatePayload`: New values (e.g., new category) if `action` is `"update"`.
    *   **Database Resolution (`repository.ts`)**:
        *   If `target` is `"last"`, fetch the most recent expense for the `source_author`.
        *   If `target` is `"id"`, fetch the expense by exact ID.
        *   If `target` is `"specific"`, query the `expenses` table using the extracted `searchCriteria`.
    *   **Execution & Feedback (`handler.ts`)**:
        *   If **0 records** are found: Respond "Nie znaleziono pasującego wydatku."
        *   If **1 record** is found: Perform the DELETE or UPDATE. Respond "Usunięto/Zaktualizowano: [Opis wydatku]".
        *   If **>1 records** are found: Do not mutate data. Respond with a list of matches and their IDs to allow exact selection, e.g., *"Znalazłem kilka pasujących wydatków. Wybierz który usunąć pisząc np. 'Usuń #45':\n- #45 Kawa 15 zł (dzisiaj)\n- #42 Kawa 15 zł (wczoraj)"*.

3.  **No Schema Changes to DB**:
    *   We will perform hard deletes (`DELETE FROM expenses`) for simplicity.
    *   The `expenses` table already has an `id` column which we can use for the exact ID matching.

## Consequences

*   **Positive:** Users can fix mistakes naturally ("Usuń ostatni") or specifically ("Usuń wczorajszy obiad").
*   **Positive:** The ID fallback prevents LLM hallucination or accidental deletion of the wrong expense when descriptions are ambiguous.
*   **Negative:** Adds slight complexity to the routing and requires a new domain with its own LLM call for extraction.
