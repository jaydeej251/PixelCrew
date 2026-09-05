# API access policy

Route handlers enforce access themselves. `src/proxy.ts` is an early rejection layer, not an
authorization boundary. Inaccessible organization resources return `404` so callers cannot use
IDs to discover another tenant's data.

`src/proxy.ts` also rejects browser mutations when `Origin` does not match the application origin
or `Sec-Fetch-Site` reports `cross-site`. Stripe and Inngest callbacks are excluded because their
provider signatures are their trust boundary.

| Route | Methods | Policy | Enforcement |
| --- | --- | --- | --- |
| `/api/auth/login` | POST | Public | Credential verification; returns `redirectTo` `/admin` for platform ops else `/app` |
| `/api/auth/signup` | POST | Public | Creates a new organization; returns `redirectTo` based on platform role / allowlist |
| `/api/auth/oauth/:provider` | GET | Public | Starts Google/GitHub OAuth; sets signed state cookie; rate limited |
| `/api/auth/callback/:provider` | GET | Public | OAuth callback; verifies state, links/creates user, sets `pc_session` |
| `/api/auth/logout` | POST | Session-aware | Deletes the presented session when present |
| `/api/auth/me` | GET | Session-aware | Returns only the current session identity including `platformRole` |
| `/api/admin/overview` | GET | Platform ops | `requirePlatformRole`; aggregate counts only |
| `/api/admin/organizations` | GET | Platform ops | Lists orgs with plan and monthly run usage |
| `/api/admin/organizations/:id` | PATCH | Platform ops | Sets org `plan` (`free`/`pro`/`enterprise`); writes `AdminAuditLog` |
| `/api/admin/runs` | GET | Platform ops | Lists recent runs; `status=stuck` filters pending/running/paused |
| `/api/admin/runs/:id/cancel` | POST | Platform ops | Cancels nonterminal runs; audit logged |
| `/api/admin/users` | GET | Platform ops | Lists users (no secrets) |
| `/api/admin/users/:id/revoke-sessions` | POST | Platform ops | Deletes all sessions for a user; audit logged |
| `/api/waitlist` | POST | Public | Email-only intake; rate limit required before public launch |
| `/api/stripe/webhook` | POST | Provider-signed | Stub only; must reject unsigned requests before billing is enabled |
| `/api/inngest` | GET, POST, PUT | Provider-signed | Inngest handler/signing configuration |
| `/api/workspace` | GET | Session | Uses the session's organization and default workspace |
| `/api/workspace/:workspaceId` | POST | Workspace | `assertWorkspaceAccess`; role policy for staffing changes is pending |
| `/api/workspace/layouts` | GET, POST | Session workspace | `requireSession` and `assertWorkspaceAccess`; lists, creates, or restores layouts only in the session workspace |
| `/api/workspace/layouts/:layoutId` | PATCH, DELETE | Organization layout | Layout lookup scopes through `OfficeLayout.workspace.organizationId`; inaccessible IDs return `404`; protected HQ cannot be renamed or deleted |
| `/api/credentials` | GET | Workspace | Lists non-secret credential metadata for an accessible workspace |
| `/api/credentials` | POST, DELETE | Workspace admin | Requires owner/admin and `assertWorkspaceAccess` |
| `/api/providers/status` | GET | Workspace | `assertWorkspaceAccess`; never returns secret values |
| `/api/providers/test` | POST | Workspace | `assertWorkspaceAccess`; OpenRouter or Ollama Cloud key probe; rate limited |
| `/api/providers/ollama/models` | GET | Workspace | `assertWorkspaceAccess`; lists local loopback Ollama models via `/api/tags`; rate limited |
| `/api/simulate` | POST | Session + development | Authenticated and disabled unless development tools are enabled |
| `/api/agents/:agentId` | GET, PATCH, DELETE | Organization agent | `assertAgentAccess` scopes through `Agent.workspace.organizationId` |
| `/api/runs` | GET | Session organization | Lists runs through workspace organization scope |
| `/api/runs` | POST | Workspace | `assertWorkspaceAccess` before provider lookup or run creation |
| `/api/runs/:runId` | GET, PATCH, DELETE | Run | `assertRunAccess` |
| `/api/runs/:runId/plan` | GET, POST | Run | `assertRunAccess` |
| `/api/runs/:runId/events` | GET | Run | `assertRunAccess` before opening the SSE stream |
| `/api/runs/:runId/export` | GET | Run | `assertRunAccess` |
| `/api/runs/:runId/preview/*` | GET | Run + token issuer | `assertRunAccess`, rate limit, then redirect to the configured preview origin |
| `/api/previews/:token/*` | GET | Signed preview asset | Five-minute HMAC token scoped to one run; restrictive CSP and no session lookup; production host must equal `PREVIEW_ORIGIN` |

## Required follow-up gates

- Route `PREVIEW_ORIGIN` to this deployment without setting the app's host-only session cookie on
  that host. Production refuses same-origin or non-HTTPS preview configuration.
- Verify Stripe signatures and persist webhook IDs before enabling paid plans.
- Keep the two-organization and browser-isolation suites required in CI as the route set grows.

## Rate limits

Limits use atomic PostgreSQL fixed-window buckets and therefore apply across application instances.

- Login: 10 attempts per IP and per normalized account per 10 minutes.
- Signup and waitlist: 5 submissions per IP per hour.
- Run creation: 20 per organization per hour.
- Provider test: 10 per organization per 10 minutes.
- Ollama local model list: 30 per organization per minute.
- Plan mutation: 60 per user/run per hour.
- Preview token issue and SSE connection: 60 and 30 per user per minute, respectively.
