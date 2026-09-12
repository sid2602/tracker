# 16. Authorize self-only Signal ingress

Date: 2026-09-11

## Status

Accepted

## Context

Signal Expense Tracker is a self-hosted application for exactly one user and
one configured Signal account. The account can have multiple linked devices,
which are represented by `SIGNAL_ALLOWED_INPUT_DEVICE_IDS`.

The current envelope classifier accepts a regular `dataMessage` from any
Signal number as an inbound command. This allows an unrelated sender to
trigger LLM processing and potentially access the account's reports or
modify the global category catalog.

The application is not being made multi-user. Categories remain global, and
reports do not gain a per-author scope. The trust boundary is the configured
Signal account itself.

## Decision

Use `SIGNAL_PHONE_NUMBER` as the only authorized logical author.

- A regular `dataMessage` is inbound only when its source author matches the
  configured Signal phone number.
- A regular `dataMessage` from another author is classified as
  `unauthorized` and is discarded before it reaches the durable inbox or any
  LLM call.
- A self-chat `syncMessage.sentMessage` is inbound only when its source and
  destination are the configured account and its source device is in
  `SIGNAL_ALLOWED_INPUT_DEVICE_IDS`.
- Bot-device echoes and self-chat messages from non-allowlisted devices remain
  ignored.
- Missing or ambiguous author/device information is handled fail-closed.
- Historical inbox payloads use the same classification. Pending or analyzed
  unauthorized rows are marked ignored without LLM processing or a response.
  Saved unauthorized rows are quarantined for manual review because their
  domain effect may already have been committed.
- Unauthorized payloads are logged without raw message content.

No database schema, category ownership, report filtering, or multi-user
isolation is introduced by this decision.

## Consequences

### Positive

- Unrelated Signal contacts cannot trigger commands or consume LLM budget.
- Incoming commands have a single explicit account-level trust boundary.
- Historical unauthorized payloads cannot bypass the new ingress check through
  the legacy inbox deserialization path.

### Negative

- Messages from another Signal account are intentionally unsupported.
- Historical unauthorized rows require manual review when they are already in
  the `saved` state.
- The configured account number and linked-device allowlist must remain
  correct for self-chat input to work.
