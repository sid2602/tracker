# 1. Use Single Node.js Worker Process

Date: 2026-09-03

## Status

Superseded by [ADR 0006](0006-switch-to-raw-signal-cli.md) for the Signal
transport details. The single-worker-process decision remains active.

## Context

The application needs to receive messages from a Signal account and process them using LLMs. We need a reliable way to connect to Signal without consuming excessive resources, as the target hardware is a Raspberry Pi. Standard webhooks require exposing a public IP or using tools like ngrok, which adds complexity and security risks.

## Decision

We will use a single Node.js background worker process written in TypeScript.
- The original wrapper-based WebSocket/REST transport was superseded by ADR
  0006. The current worker connects directly to the local `signal-cli` daemon
  over raw TCP JSON-RPC.
- It does not expose any HTTP server (no Express, no Fastify).
- It handles the entire pipeline: receiving JSON-RPC events, routing via LLM,
  validating data, saving to the database, and sending JSON-RPC responses back
  via Signal.

## Consequences

- **Positive:** Simple deployment model (just one worker container + signal-cli). No need to expose ports to the internet. Minimal memory footprint.
- **Negative:** Horizontal scaling is harder (though not needed for a personal tracker). If the process crashes, message processing halts until Docker restarts the container.
