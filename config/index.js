const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");

// APP_ENV: production | staging | development
// Env files: `.env.<APP_ENV>` (if present) is loaded first, then `.env` as a fallback.
// Real environment variables (e.g. set in Render) always win over files.
const rootDir = path.join(__dirname, "..");
function envFromDotenvFile() {
  const p = path.join(rootDir, ".env");
  if (!fs.existsSync(p)) return "";
  return dotenv.parse(fs.readFileSync(p)).APP_ENV || "";
}
const APP_ENV = String(process.env.APP_ENV || envFromDotenvFile() || "production").trim().toLowerCase();
for (const file of [`.env.${APP_ENV}`, ".env"]) {
  const p = path.join(rootDir, file);
  if (fs.existsSync(p)) dotenv.config({ path: p });
}

const IS_PROD = APP_ENV === "production";

function parseIds(raw) {
  return String(raw || "")
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((x) => Number.isInteger(x) && x !== 0);
}

module.exports = {
  APP_ENV,
  IS_PROD,
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMINS: (process.env.ADMIN_IDS || "").split(",").map(Number),
  ORGANIZERS: parseIds(
    process.env.ORGANIZER_IDS || (IS_PROD ? "7499967163,365598083" : ""),
  ),
  // Channel or group for announcements. For a group with topics, CHANNEL_THREAD_ID
  // is the topic id the bot posts into (empty = General).
  CHANNEL_ID: process.env.CHANNEL_ID,
  CHANNEL_THREAD_ID: parseInt(process.env.CHANNEL_THREAD_ID || "", 10) || null,
  // Overwritten at startup with the real username from getMe(), so deep links
  // always point to the bot this instance is running as.
  BOT_USERNAME: process.env.BOT_USERNAME || (IS_PROD ? "banana_airsoft_app_bot" : ""),
  // Username of the production bot. Non-production instances refuse to start with it.
  PROD_BOT_USERNAME: process.env.PROD_BOT_USERNAME || "banana_airsoft_app_bot",
  // Production channel id. Non-production instances refuse to post into it.
  PROD_CHANNEL_ID: process.env.PROD_CHANNEL_ID || "",
  // Non-production only: if set, the bot may message only these chats (plus CHANNEL_ID).
  TEST_CHAT_IDS: parseIds(process.env.TEST_CHAT_IDS),
  PAYMENT_CARD_NUMBER: process.env.PAYMENT_CARD_NUMBER || "4441114452431495",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  WEBAPP_URL: process.env.WEBAPP_URL,
  DB: {
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "3306"),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "airsoft_db",
  },
  isAdmin(ctx) {
    return this.ADMINS.includes(ctx.from?.id);
  },
  isOrganizer(ctx) {
    return this.ORGANIZERS.includes(ctx.from?.id);
  },
};
