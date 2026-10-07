# CI/CD

| Гілка | Середовище | Домен | Папка на сервері (`DEPLOY_PATH`) | pm2 | Порт |
|---|---|---|---|---|---|
| `main` | production | airsoft.tangle.care | `…/airsoft_html/airsoft-app` | `airsoft-production` | 3000 |
| `staging` | staging | airsoft-staging.tangle.care | `…/airsoftstaging_html/airsoft-app` | `airsoft-staging` | 3001 |

Push у гілку → GitHub Actions (`.github/workflows/deploy.yml`):
1. `check`: `npm ci`, перевірка синтаксису, збірка `webapp`.
2. `deploy`: SSH на сервер → `git fetch` + `git reset --hard <commit>` у `DEPLOY_PATH` (`.env` і `logs/` не чіпаються, бо в `.gitignore`).
3. `deploy/remote-deploy.sh`: `npm ci --omit=dev`, збірка webapp, рестарт pm2, health-check `/api/health` (має повернути правильний `env`). Якщо не піднялось — job червоний і в логах видно `pm2 logs`.

Секрети репозиторію (Settings → Secrets and variables → Actions):
`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`.

Змінна `DEPLOY_PATH` — окремо в кожному environment (Settings → Environments → `production` / `staging` → Environment variables).

Env-файли лежать лише на сервері: `<DEPLOY_PATH>/.env`.

Корисне на сервері (під користувачем `deploy`):
```
pm2 ls
pm2 logs airsoft-staging
pm2 restart airsoft-production
```

## Домен → Node

Корінь сайту в панелі — `<DEPLOY_PATH>/webapp/dist` (зібраний фронтенд), а НЕ папка з кодом.
`remote-deploy.sh` після збірки пише туди `.htaccess`: існуючі файли віддає веб-сервер,
усе інше (`/api`, `/gifts`, `/equipment`, маршрути SPA) проксується в Node на `PORT` з `.env`.
Код, `.env` і логи поза веб-коренем, тож через сайт недоступні.

Перевірка: `https://<домен>/` → застосунок, `/api/health` → правильний `env`, `/package.json` → 404.
