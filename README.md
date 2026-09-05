# PixelCrew

**Your AI company, visible.**

Hire agents by role, watch them work on a living office floor, approve the plan, then preview and download what they built. You bring the model keys — PixelCrew is the company, not the meter.

[![Status](https://img.shields.io/badge/status-free%20beta-amber)](#status)
[![Stack](https://img.shields.io/badge/stack-Next.js%2016%20·%20Prisma%20·%20Postgres-zinc)](#stack)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

<p align="center">
  <img src="public/marketing/office.png" alt="PixelCrew isometric office floor with agents at their desks" width="720" />
</p>

## Why it exists

Most AI tools collapse into one chat box. PixelCrew treats the **organization** as the product:

| Pillar | Idea |
| --- | --- |
| **Org** | Staff specialists by role — product, design, engineering, QA — instead of one generic assistant. |
| **Office** | See agents move to desks, plan together, and write files on an isometric floor. |
| **You** | Approve the plan before they build. Preview the deliverable. Download a zip. Stay in control. |

Charge for the office experience. Inference stays **BYOK** (bring your own keys).

## Status

PixelCrew is in a **free soft-launch beta**.

**Works today**

- Office floor, planning council, plan review
- Project files, in-browser preview, ZIP / HTML export
- Auth (email/password + Google / GitHub OAuth)
- BYOK providers: OpenRouter, Gemini, Ollama (local or cloud)
- Free tier: **5 new runs / calendar month** (resumes do not consume an extra run)

**Not in this beta**

- Live deploy of the generated app
- GitHub PR delivery
- Paid checkout / Stripe billing
- Claiming agents ran real shell tools in an isolated sandbox

## Quick start

Requirements: **Node 20+**, **Postgres 16+**, and optionally **Docker**.

```bash
# Optional — local Postgres via Docker
npm run docker:up

cp .env.example .env.local
# Edit .env.local — at minimum DATABASE_URL, AUTH_SECRET, ENCRYPTION_KEY

npm install
npm run db:push

# Optional local accounts — set SEED_* in .env.local first (never commit passwords)
npm run db:seed

npm run dev
```

| URL | Purpose |
| --- | --- |
| [http://localhost:3000](http://localhost:3000) | Marketing |
| [http://localhost:3000/app](http://localhost:3000/app) | Office |
| [http://localhost:3000/admin](http://localhost:3000/admin) | Platform ops (allowlisted emails only) |

## Stack

| Layer | Choice |
| --- | --- |
| App | Next.js 16 (App Router), React 19, TypeScript |
| UI | Tailwind CSS 4, Framer Motion, Three.js office floor |
| Data | PostgreSQL, Prisma |
| Auth | Session cookie (`pc_session`) + Google / GitHub OAuth |
| Jobs | Inngest (optional locally) |
| Models | OpenRouter, Google Gemini, Ollama — credentials encrypted at rest |

## Configuration

Copy `.env.example` → `.env.local`. Never commit secrets.

**Local essentials**

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Session signing (`openssl rand -hex 32`) |
| `ENCRYPTION_KEY` | Encrypts stored provider keys (`openssl rand -hex 32`) |
| `NEXT_PUBLIC_APP_URL` | App origin (e.g. `http://localhost:3000`) |
| `PREVIEW_ORIGIN` | Preview host (production: separate HTTPS origin) |

**Provider keys** — set in `.env.local` for local convenience, or add them in the app UI (preferred; encrypted at rest):

- `OPENROUTER_API_KEY`
- `GOOGLE_API_KEY`
- `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434/v1`)
- `OLLAMA_API_KEY` (Ollama Cloud — with only this set, the app uses `https://ollama.com/v1`)

**Platform ops** — grant `/admin` with `PLATFORM_ADMIN_EMAILS` (comma-separated). Do not run `db:seed` against production unless you intentionally set `ALLOW_DB_SEED=true`.

See `.env.example` for OAuth client IDs, preview secrets, sandbox flags, and Stripe placeholders.

## Architecture (short)

```
Goal → planning council → you approve → agents write files → preview + ZIP
```

- **Runs** are the user-facing unit of work (start, pause, resume, export).
- **Execution / Attempt** rows are the durable ledger behind each task; the UI stream (`RunEvent`) is a projection, not the source of truth.
- Route handlers enforce **org / workspace tenancy** themselves. Missing resources return `404` (no cross-tenant ID probing).
- Preview assets are served from a dedicated origin/token path so the session cookie stays off the preview host in production.

Deeper access rules: [`docs/api-access-policy.md`](docs/api-access-policy.md).

## Production checklist

Before exposing a deployment:

1. Set unique `ENCRYPTION_KEY`, `AUTH_SECRET`, and `PREVIEW_TOKEN_SECRET` (≥ 32 characters each).
2. Set `NEXT_PUBLIC_APP_URL` to the HTTPS app origin.
3. Set `PREVIEW_ORIGIN` to a **different** HTTPS host routed to the same deploy. Do not scope the `pc_session` cookie on that host.
4. Apply migrations with `npx prisma migrate deploy` (rate limiting depends on `RateLimitBucket`).
5. Keep `npm run check` green in CI — lint, unit/security contracts, two-tenant API isolation, browser preview isolation, and production build.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server |
| `npm run build` / `npm start` | Production build & serve |
| `npm run check` | Full gate (lint + tests + Playwright + build) |
| `npm test` | Unit / contract tests |
| `npm run test:browser` | Playwright browser isolation tests |
| `npm run db:push` | Push Prisma schema (local) |
| `npm run db:migrate` | Create / apply migrations |
| `npm run db:seed` | Seed local accounts from `SEED_*` env vars |
| `npm run docker:up` | Start Postgres via Docker Compose |

## Roadmap

Near-term direction after the soft launch:

- Higher limits and paid plans (Stripe)
- Stronger sandbox / tool execution story
- GitHub delivery and hosted deploy of generated apps
- Workflows, memory, and eval loops

## Contributing

The product is early and moving. If you open a PR:

1. Keep changes scoped and reviewable.
2. Add or update tests when behavior changes.
3. Run `npm run check` before asking for review.
4. Never commit `.env`, `.env.local`, or real API keys.

Bug reports and honest beta feedback are welcome via [support](https://github.com/jaydeej251/PixelCrew/issues) or the in-app support page.

## License

[MIT](LICENSE) © 2026 Dj Junio
