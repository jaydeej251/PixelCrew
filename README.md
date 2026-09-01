# PixelCrew

Watch your AI company work — hire agents by role, run in parallel, bring your own keys.

## Quick start

```bash
# Start Postgres (optional — or use local Postgres)
npm run docker:up

# Install & setup DB
npm install
npm run db:push
npm run db:seed

# Run dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for marketing, [http://localhost:3000/app](http://localhost:3000/app) for the office.

## API keys

Never commit keys. Copy `.env.example` to `.env.local` and add:

- `OPENROUTER_API_KEY`
- `GOOGLE_API_KEY`
- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434/v1`)

Or add credentials in the app UI (encrypted at rest).

## Phases

- **Phase 1:** Office floor, org builder, simulate run
- **Phase 2:** Real orchestrator, BYOK providers, SSE, export
- **Phase 3:** Workflows, memory, evals
- **Phase 4:** Auth, billing, multi-tenant SaaS
- **Phase 5:** Marketing, pricing, waitlist
- **Phase 6:** Sandbox execution (stub ready)
