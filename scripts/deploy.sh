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

require_tailwind_in_dependencies() {
  node <<'NODE'
const pkg = require("./package.json");
const inDeps =
  pkg.dependencies &&
  pkg.dependencies["@tailwindcss/postcss"] &&
  pkg.dependencies.tailwindcss;
if (!inDeps) {
  console.error(
    "package.json is missing @tailwindcss/postcss/tailwindcss in dependencies.",
  );
  console.error("Fetch latest main (PR #19+) before deploying.");
  process.exit(1);
}
NODE
}

require_tailwind_installed() {
  node <<'NODE'
try {
  require.resolve("@tailwindcss/postcss");
  require.resolve("tailwindcss");
} catch (err) {
  console.error("Build deps missing after npm ci:", err.message);
  process.exit(1);
}
NODE
}

install_dependencies() {
  # NODE_ENV=production in the shell makes npm skip devDependencies. Build still
  # needs TypeScript/@types. Tailwind is in dependencies, but we force a full
  # install so deploy never depends on shell env quirks or npm flag support.
  log "Installing dependencies (production=false for install only)"
  log "NODE_ENV=${NODE_ENV-<unset>} npm $(npm -v)"

  if npm ci --help 2>&1 | grep -q -- '--include'; then
    NPM_CONFIG_PRODUCTION=false npm ci --include=dev
  else
    NPM_CONFIG_PRODUCTION=false npm ci
  fi

  require_tailwind_installed
  log "Verified @tailwindcss/postcss and tailwindcss in node_modules"
}

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
  git cat-file -e "${TARGET}^{commit}" 2>/dev/null || die "Unknown ref/SHA: ${TARGET}"
fi

log "Syncing to ${TARGET}"
# Stay on a branch (not detached) so manual `git pull origin main` matches deploy.sh.
if git show-ref --verify --quiet refs/heads/main; then
  git checkout main
else
  git checkout -B main "${TARGET}"
fi
git reset --hard "${TARGET}"

DEPLOYED_SHA="$(git rev-parse --short HEAD)"
log "Deployed commit: ${DEPLOYED_SHA} — $(git log -1 --pretty=format:'%s')"

require_tailwind_in_dependencies
install_dependencies

log "Applying migrations"
npx prisma migrate deploy

log "Building (clean .next cache)"
rm -rf .next
npm run build

if pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  log "Reloading PM2 app '${PM2_APP_NAME}'"
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

log "Deploy complete at ${DEPLOYED_SHA}"
pm2 status "${PM2_APP_NAME}"
