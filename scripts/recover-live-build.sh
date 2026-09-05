#!/usr/bin/env bash
# One-shot recovery when production build fails with missing @tailwindcss/postcss.
# Safe to run on the GCP VM — does not touch .env or PM2 config beyond restart.
#
# Usage:
#   cd ~/PixelCrew && ./scripts/recover-live-build.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${APP_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
PM2_APP_NAME="${PM2_APP_NAME:-pixelcrew}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

cd "${APP_DIR}"
[[ -f package.json ]] || die "No package.json in ${APP_DIR}"

log "Node $(node -v) / npm $(npm -v) / NODE_ENV=${NODE_ENV-<unset>}"
log "Before: $(git rev-parse --short HEAD 2>/dev/null || echo 'not a git repo')"

log "Fetching and hard-resetting to origin/main"
git fetch --prune origin
git checkout main 2>/dev/null || git checkout -B main origin/main
git reset --hard origin/main

log "At commit $(git rev-parse --short HEAD)"
node -e "
const p=require('./package.json');
const ok=p.dependencies&&p.dependencies['@tailwindcss/postcss'];
if(!ok){console.error('Still on old package.json — origin/main missing PR #19');process.exit(1)}
console.log('OK: @tailwindcss/postcss is in dependencies');
"

log "Clean install (NPM_CONFIG_PRODUCTION=false)"
rm -rf node_modules .next
if npm ci --help 2>&1 | grep -q -- '--include'; then
  NPM_CONFIG_PRODUCTION=false npm ci --include=dev
else
  NPM_CONFIG_PRODUCTION=false npm ci
fi

node -e "require.resolve('@tailwindcss/postcss'); console.log('OK: module resolves')"

log "Building"
npm run build

if command -v pm2 >/dev/null && pm2 describe "${PM2_APP_NAME}" >/dev/null 2>&1; then
  log "Restarting PM2 ${PM2_APP_NAME}"
  pm2 restart "${PM2_APP_NAME}" --update-env
  pm2 save
else
  log "PM2 app not found — start manually: pm2 start npm --name ${PM2_APP_NAME} -- start"
fi

log "Recovery complete"
