#!/usr/bin/env bash
# One-time server setup (Ubuntu/Debian). Run as root:
#   bash setup-server.sh "<public key for GitHub Actions>"
set -euo pipefail

DEPLOY_USER=deploy
PUBKEY="${1:-}"
REPO_RAW="https://raw.githubusercontent.com/krupchynskyiai/airsoft-app/main/deploy/nginx"

echo "▶ Packages"
apt-get update
apt-get install -y curl git rsync nginx certbot python3-certbot-nginx ca-certificates gnupg

if ! command -v node >/dev/null || ! node -v | grep -q '^v20'; then
  echo "▶ Node.js 20"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
npm install -g pm2

echo "▶ User $DEPLOY_USER"
id "$DEPLOY_USER" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$DEPLOY_USER"
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
if [ -n "$PUBKEY" ]; then
  AK="/home/$DEPLOY_USER/.ssh/authorized_keys"
  touch "$AK"
  grep -qxF "$PUBKEY" "$AK" || echo "$PUBKEY" >> "$AK"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$AK"; chmod 600 "$AK"
fi

echo "▶ App directories"
install -d -o "$DEPLOY_USER" -g "$DEPLOY_USER" /srv/airsoft /srv/airsoft/production /srv/airsoft/staging

echo "▶ pm2 autostart"
env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$DEPLOY_USER" --hp "/home/$DEPLOY_USER"

echo "▶ nginx"
for host in airsoft.tangle.care airsoft-staging.tangle.care; do
  if [ -f "$(dirname "$0")/nginx/$host.conf" ]; then
    cp "$(dirname "$0")/nginx/$host.conf" "/etc/nginx/sites-available/$host.conf"
  else
    curl -fsSL "$REPO_RAW/$host.conf" -o "/etc/nginx/sites-available/$host.conf"
  fi
  ln -sf "/etc/nginx/sites-available/$host.conf" "/etc/nginx/sites-enabled/$host.conf"
done
nginx -t && systemctl reload nginx

cat <<MSG

✅ Done. Next:
  1. Point DNS A records airsoft.tangle.care and airsoft-staging.tangle.care to this server.
  2. certbot --nginx -d airsoft.tangle.care -d airsoft-staging.tangle.care
  3. Create /srv/airsoft/production/.env and /srv/airsoft/staging/.env
     (owner $DEPLOY_USER, chmod 600) — see .env.*.example in the repo.
MSG
