#!/usr/bin/env bash
# Production deploy for the GCP VM (Caddy + PM2 + Neon).
#
# Usage (on the server):
#   ./scripts/deploy.sh              # deploy current origin/main
#   DEPLOY_SHA=abc123 ./scripts/deploy.sh
#
# Env (optional):
#   DEPLOY_SHA     Git commit to deploy (default: origin/main)
#   APP_DIR        App root (default: directory containing this script's repo)
#   PM2_APP_NAME   PM2 process name (default: pixelcrew)
#   HEALTH_URL     Local health check (default: http://127.0.0.1:3000)
#   SKIP_HEALTH=1  Skip curl health check
#
# Does not touch .env — keep secrets on the server only.

set -euo pipefail

PM2_APP_NAME="${PM2_APP_NAME:-pixelcrew}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cd "${APP_DIR}"

[[ -f package.json ]] || die "No package.json in ${APP_DIR}"
[[ -f .env ]] || die "Missing .env in ${APP_DIR} — create it on the server before deploying"
command -v node >/dev/null || die "node not found"
command -v npm >/dev/null || die "npm not found"
command -v pm2 >/dev/null || die "pm2 not found"
command -v npx >/dev/null || die "npx not found"

log "App dir: ${APP_DIR}"
log "Node $(node -v) / npm $(npm -v)"

if [[ -n "$(git status --porcelain)" ]]; then
  die "Working tree is dirty on the server. Commit, stash, or discard before deploying."
fi

log "Fetching origin"
git fetch --prune origin

TARGET="${DEPLOY_SHA:-origin/main}"
if [[ "${TARGET}" != origin/* && "${TARGET}" != refs/* ]]; then
  # bare SHA or tag — ensure we have it
  git cat-file -e "${TARGET}^{commit}" 2>/dev/null || die "Unknown ref/SHA: ${TARGET}"
fi

log "Checking out ${TARGET}"
git checkout --detach "${TARGET}"

log "Installing dependencies (npm ci --include=dev)"
# Servers often export NODE_ENV=production globally; that skips devDependencies and
# breaks `next build` (Tailwind PostCSS, TypeScript, @types/*). Build needs devDeps.
npm ci --include=dev

log "Applying migrations"
npx prisma migrate deploy

log "Building"
npm run build

if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  log "Reloading PM2 app '${PM2_APP_NAME}'"
  # restart (not reload) — Next standalone-ish start is one process; restart is reliable
  pm2 restart "${PM2_APP_NAME}" --update-env
else
  log "Starting PM2 app '${PM2_APP_NAME}'"
  pm2 start npm --name "${PM2_APP_NAME}" -- start
fi

pm2 save

if [[ "${SKIP_HEALTH:-}" == "1" ]]; then
  log "Skipping health check"
else
  log "Health check ${HEALTH_URL}"
  ok=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    if curl -fsS -o /dev/null --max-time 5 "${HEALTH_URL}"; then
      ok=1
      break
    fi
    sleep 2
  done
  [[ "${ok}" -eq 1 ]] || die "Health check failed after restart — check: pm2 logs ${PM2_APP_NAME}"
  log "Health check OK"
fi

log "Deployed $(git rev-parse --short HEAD) — $(git log -1 --pretty=format:'%s')"
pm2 status "${PM2_APP_NAME}"
