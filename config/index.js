require("dotenv").config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMINS: (process.env.ADMIN_IDS || "").split(",").map(Number),
  ORGANIZERS: (
    process.env.ORGANIZER_IDS || "7499967163,365598083"
  )
    .split(",")
    .map((x) => Number(String(x).trim()))
    .filter((x) => Number.isInteger(x) && x > 0),
  CHANNEL_ID: process.env.CHANNEL_ID,
  BOT_USERNAME: process.env.BOT_USERNAME || "banana_airsoft_app_bot",
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