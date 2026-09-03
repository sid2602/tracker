# 6. Switch to raw signal-cli JSON-RPC

Date: 2026-09-03

## Status

Accepted

## Context

We previously attempted to solve offline message loss by switching from WebSockets (JSON-RPC wrapper) to Webhooks, and then to REST polling, using the `bbernhard/signal-cli-rest-api` Docker image. However:
1. The Webhook implementation in `MODE=json-rpc` proved to be broken/unsupported.
2. The REST Polling in `MODE=native` works but causes significant CPU usage, I/O writes, and latency on the Raspberry Pi because it constantly queries the DBus/JVM wrapper.
3. The root cause of the dropped offline messages was always the race condition between the `signal-cli` daemon fetching messages on startup and the wrapper not having any connected clients (or webhook setup) to push them to.

## Decision

We are bypassing the HTTP/WebSocket wrapper entirely and talking directly to the underlying `signal-cli` Java daemon.
We will run `signal-cli` in `daemon` mode over a raw TCP socket (port 6001) using the built-in `--receive-mode on-connection` flag.
Our Node.js worker will connect directly to this TCP socket to receive and send messages using the official Signal JSON-RPC 2.0 specification.

## Consequences

*   **Zero CPU Waste:** Polling is completely eliminated.
*   **100% Delivery Guarantee:** Because of `--receive-mode on-connection`, the `signal-cli` daemon will *not* pull messages from the Signal servers until our Node.js worker actively connects to the TCP socket, completely eliminating the startup race condition.
*   **Reduced Abstraction:** We no longer rely on the `bbernhard` HTTP/WebSocket abstractions and must parse the raw JSON-RPC envelopes directly.
*   **Stateful Connection:** The worker must manage TCP socket reconnections natively (handled via `node:net`).
