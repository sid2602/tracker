# Signal Expense Tracker

A personal, AI-powered expense tracking bot operating directly via Signal. 

You send a message to yourself in Signal, e.g., `groceries 15 PLN`, `gas station 15 PLN` or `generate expense report for this month`. The application recognizes the note type, saves the expense, or replies with a report. Random notes are ignored.

## Prerequisites
- Docker & Docker Compose (for running the Signal CLI and application).
- Node.js & npm (for local development).
- API Key for Vercel AI Gateway (connecting to OpenAI/Anthropic).

## Quick Start (Docker)

1. Clone the repository.
2. Copy `.env.example` to `.env` and fill in your keys:
   ```env
   AI_GATEWAY_API_KEY=your_key
   LLM_PROVIDER=openai
   LLM_MODEL=gpt-4o-mini
   SIGNAL_API_URL=http://signal-cli-rest-api:8080
   SIGNAL_PHONE_NUMBER=+123456789
   ```
3. Run the application using Docker Compose:
   ```bash
   docker compose up -d
   ```
   *Note: Ensure you have linked your Signal device to the `signal-cli-rest-api` container (typically via QR code binding on `127.0.0.1:8080`).*

## Local Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Type check the project:
   ```bash
   npm run typecheck
   ```
3. Run tests:
   ```bash
   npm test
   ```
4. Start the worker locally (requires `signal-cli-rest-api` running locally or forwarded):
   ```bash
   npm start
   ```

For detailed architectural information, see [architecture.md](architecture.md).
For rules regarding AI assistance, see [agents.md](agents.md).
