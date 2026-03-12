const mysql = require("mysql2/promise");
const config = require("../config");
const log = require("../utils/logger");

let db;

async function initDB() {
  log.info("Connecting MySQL...", {
    host: config.DB.host,
    database: config.DB.database,
  });

  try {
    db = await mysql.createPool({
      host: config.DB.host,
      port: config.DB.port,
      user: config.DB.user,
      password: config.DB.password,
      database: config.DB.database,
      waitForConnections: true,
      connectionLimit: 10,
      charset: "utf8mb4",
    });

    await db.execute("SELECT 1");
    log.info("MySQL OK");
  } catch (e) {
    log.error("MySQL FAIL", { error: e.message });
    process.exit(1);
  }
}

function getDB() {
  return db;
}

module.exports = { initDB, getDB };