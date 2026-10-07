# Staging vs Production

Один код, два середовища. Яке саме — визначає змінна `APP_ENV` (`production` за замовчуванням, `staging`, `development`).

| | Production | Staging |
|---|---|---|
| Бот | @banana_airsoft_app_bot | окремий бот з @BotFather |
| Канал | основний | тестовий канал або порожньо |
| База | `airsoft_db` | окрема, напр. `airsoft_staging` |
| Сервіс | прод-сервіс | окремий сервіс / домен |

## Налаштування staging

1. @BotFather → `/newbot` (наприклад `banana_airsoft_staging_bot`), взяти токен.
   Там же `/newapp` або Menu Button → URL staging-домену, якщо використовується Mini App.
2. Створити окрему MySQL-базу і прогнати міграції з `database/migrations`.
3. (Опційно) створити тестовий канал і додати staging-бота адміном.
4. Створити другий сервіс (напр. на Render) з того ж репо / гілки і задати змінні з `.env.staging.example`.
   Локально: скопіювати в `.env.staging` і запустити `APP_ENV=staging npm start`.

## Захист від витоку в прод

Коли `APP_ENV` ≠ `production`:

- Сервер **не стартує**, якщо токен належить `PROD_BOT_USERNAME` або `CHANNEL_ID` = `PROD_CHANNEL_ID`.
- Будь-які повідомлення в `PROD_CHANNEL_ID` блокуються.
- Якщо задано `TEST_CHAT_IDS`, бот пише лише цим чатам і `CHANNEL_ID`; решта лише логуються (`Blocked sendMessage`).
- `BOT_USERNAME` береться з `getMe()`, тож deep-link'и ведуть у staging-бота.
- Відповідь на `/start` позначена `🧪 STAGING`; `/api/health` повертає `env`.
- Немає прод-дефолтів для `ORGANIZER_IDS` / `BOT_USERNAME`.

Окремий бот сам по собі вже не може написати гравцям, які його не запускали, тож навіть із копією прод-бази сповіщення реальним гравцям не підуть.
