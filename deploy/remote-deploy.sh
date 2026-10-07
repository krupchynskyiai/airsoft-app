#!/usr/bin/env bash
# Runs on the server inside the app checkout (after `git reset` to the new commit).
# Usage: remote-deploy.sh <production|staging> [version]
set -euo pipefail

APP_ENV="${1:?usage: remote-deploy.sh <production|staging> [version]}"
VERSION="${2:-unknown}"
APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NAME="airsoft-$APP_ENV"

cd "$APP_DIR"

if [ ! -f .env ]; then
  echo "❌ $APP_DIR/.env is missing. Create it from .env.$APP_ENV.example first." >&2
  exit 1
fi
if ! grep -qE "^APP_ENV=$APP_ENV\b" .env; then
  echo "❌ $APP_DIR/.env must contain APP_ENV=$APP_ENV" >&2
  exit 1
fi

PORT="$(grep -E '^PORT=' .env | cut -d= -f2 | tr -d '[:space:]"' || true)"
PORT="${PORT:-3000}"

echo "▶ Installing dependencies ($APP_ENV, $VERSION)"
npm ci --omit=dev --no-audit --no-fund
mkdir -p logs

echo "▶ Building webapp"
(cd webapp && npm ci --no-audit --no-fund && npm run build)

# webapp/dist is the web root: the panel's web server serves the built files,
# everything else (API, /gifts, /equipment, SPA routes) is proxied to Node.
cat > webapp/dist/.htaccess <<HTACCESS
<FilesMatch "^\.">
  Require all denied
</FilesMatch>

RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteRule ^(.*)\$ http://127.0.0.1:$PORT/\$1 [P,L]
HTACCESS

echo "▶ Restarting $NAME"
if pm2 describe "$NAME" >/dev/null 2>&1; then
  APP_ENV="$APP_ENV" pm2 restart "$NAME" --update-env
else
  APP_ENV="$APP_ENV" pm2 start index.js --name "$NAME" --cwd "$APP_DIR" --time
fi
pm2 save >/dev/null

echo "▶ Health check on :$PORT"
for i in $(seq 1 20); do
  if body="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"; then
    if echo "$body" | grep -q "\"env\":\"$APP_ENV\""; then
      echo "✅ $NAME is up: $body"
      exit 0
    fi
    echo "❌ Health check returned unexpected env: $body" >&2
    exit 1
  fi
  sleep 2
done

echo "❌ $NAME did not become healthy. Last logs:" >&2
pm2 logs "$NAME" --lines 50 --nostream >&2 || true
exit 1
