# CI/CD

| Гілка | Середовище | Домен | Папка на сервері | pm2 | Порт |
|---|---|---|---|---|---|
| `main` | production | airsoft.tangle.care | `/srv/airsoft/production` | `airsoft-production` | 3000 |
| `staging` | staging | airsoft-staging.tangle.care | `/srv/airsoft/staging` | `airsoft-staging` | 3001 |

Push у гілку → GitHub Actions (`.github/workflows/deploy.yml`):
1. `npm ci`, перевірка синтаксису, збірка `webapp`.
2. `rsync` коду на сервер (`.env`, `logs/`, `node_modules/` на сервері не чіпаються).
3. `deploy/remote-deploy.sh`: `npm ci --omit=dev`, рестарт pm2, health-check `/api/health` (має повернути правильний `env`). Якщо не піднялось — job червоний і в логах видно `pm2 logs`.

Секрети репозиторію (Settings → Secrets and variables → Actions):
`SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS`.

Перший запуск сервера: `deploy/setup-server.sh`. Env-файли лежать лише на сервері: `/srv/airsoft/<env>/.env`.

Корисне на сервері (під користувачем `deploy`):
```
pm2 ls
pm2 logs airsoft-staging
pm2 restart airsoft-production
```
