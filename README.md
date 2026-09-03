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
- `OLLAMA_BASE_URL` (default local `http://127.0.0.1:11434/v1`)
- `OLLAMA_API_KEY` (Ollama Cloud from [ollama.com/settings/keys](https://ollama.com/settings/keys); with only this set, PixelCrew uses `https://ollama.com/v1`)

Or add credentials in the app UI (encrypted at rest). For Ollama Cloud, choose **Ollama**, paste the API key, and keep Base URL as `https://ollama.com/v1` (the form switches there automatically when you paste a key).

## Production security requirements

- Set `ENCRYPTION_KEY` and `PREVIEW_TOKEN_SECRET` to unique secrets of at least 32 characters.
- Set `NEXT_PUBLIC_APP_URL` to the application HTTPS origin.
- Set `PREVIEW_ORIGIN` to a different HTTPS host routed to the same deployment, such as
  `https://preview.example.com`. Do not set the `pc_session` cookie on this host.
- Apply committed migrations with `npx prisma migrate deploy`; production rate limiting depends on
  the `RateLimitBucket` table.
- Keep `npm run check` required in CI. It includes lint, unit/security contracts, two-tenant API
  isolation, browser preview isolation, and a production build.

## Phases

- **Phase 1:** Office floor, org builder, simulate run
- **Phase 2:** Real orchestrator, BYOK providers, SSE, export
- **Phase 3:** Workflows, memory, evals
- **Phase 4:** Auth (email/password sessions), conversation history sidebar
- **Phase 5:** Marketing, pricing, waitlist
- **Phase 6:** Real project files, drop-in zip export, in-office preview (static). E2B/GitHub still later.
