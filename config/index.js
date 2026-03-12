require("dotenv").config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMINS: (process.env.ADMIN_IDS || "").split(",").map(Number),
  CHANNEL_ID: process.env.CHANNEL_ID,
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
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
};