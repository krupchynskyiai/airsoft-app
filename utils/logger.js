const fs = require("fs");
const path = require("path");
const config = require("../config");

const LOG_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

function ts() {
  return new Date().toISOString();
}

function logFile() {
  const d = new Date();
  return path.join(
    LOG_DIR,
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}.log`
  );
}

function writeToFile(level, msg, meta = {}) {
  const m = Object.keys(meta).length ? ` | ${JSON.stringify(meta)}` : "";
  fs.appendFileSync(logFile(), `[${ts()}] [${level}] ${msg}${m}\n`, "utf8");
}

const log = {
  info(msg, meta = {}) {
    console.log(`ℹ️  [${ts()}] ${msg}`, Object.keys(meta).length ? meta : "");
    writeToFile("INFO", msg, meta);
  },
  warn(msg, meta = {}) {
    console.warn(`⚠️  [${ts()}] ${msg}`, Object.keys(meta).length ? meta : "");
    writeToFile("WARN", msg, meta);
  },
  error(msg, meta = {}) {
    console.error(`❌ [${ts()}] ${msg}`, Object.keys(meta).length ? meta : "");
    writeToFile("ERROR", msg, meta);
  },
  debug(msg, meta = {}) {
    if (config.LOG_LEVEL === "debug") {
      console.log(`🐛 [${ts()}] ${msg}`, Object.keys(meta).length ? meta : "");
    }
    writeToFile("DEBUG", msg, meta);
  },
  cb(uid, un, data) {
    const m = `CB [${data}] @${un || "?"}(${uid})`;
    console.log(`🔘 [${ts()}] ${m}`);
    writeToFile("CB", m);
  },
  db(op, details = {}) {
    console.log(`🗄️  [${ts()}] DB ${op}`, Object.keys(details).length ? details : "");
    writeToFile("DB", op, details);
  },
};

module.exports = log;