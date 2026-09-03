# 1. Use Single Node.js Worker Process

Date: 2026-09-03

## Status

Accepted

## Context

The application needs to receive messages from a Signal account and process them using LLMs. We need a reliable way to connect to Signal without consuming excessive resources, as the target hardware is a Raspberry Pi. Standard webhooks require exposing a public IP or using tools like ngrok, which adds complexity and security risks.

## Decision

We will use a single Node.js background worker process written in TypeScript. 
- It connects to a local `signal-cli-rest-api` container via WebSockets (`ws://.../v1/receive/{number}`) running in `MODE=json-rpc`.
- It does not expose any HTTP server (no Express, no Fastify).
- It handles the entire pipeline: listening to WebSocket events, routing via LLM, validating data, saving to the database, and sending responses back via Signal REST API.

## Consequences

- **Positive:** Simple deployment model (just one worker container + signal-cli). No need to expose ports to the internet. Minimal memory footprint.
- **Negative:** Horizontal scaling is harder (though not needed for a personal tracker). If the process crashes, message processing halts until Docker restarts the container.
