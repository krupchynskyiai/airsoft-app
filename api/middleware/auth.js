const crypto = require("crypto");
const config = require("../../config");
const log = require("../../utils/logger");

/**
 * Validates Telegram WebApp initData
 */
function validateInitData(initData) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");

  const secretKey = crypto
    .createHmac("sha256", "WebAppData")
    .update(config.BOT_TOKEN)
    .digest();

  const checkHash = crypto
    .createHmac("sha256", secretKey)
    .update(dataCheckString)
    .digest("hex");

  if (checkHash !== hash) return null;

  try {
    const userStr = params.get("user");
    if (userStr) return JSON.parse(userStr);
  } catch (e) {}

  return null;
}

/**
 * Express middleware — validates TG auth or allows dev mode
 */
function authMiddleware(req, res, next) {
  // ---- DEV MODE: bypass auth for local development ----
  if (process.env.DEV_MODE === "true") {
    req.tgUser = {
      id: parseInt(process.env.DEV_USER_ID || config.ADMINS[0] || 0),
      first_name: "Dev",
      last_name: "User",
      username: "dev_user",
    };
    log.debug("DEV mode auth bypass", { userId: req.tgUser.id });
    return next();
  }

  const initData = req.headers["x-telegram-init-data"];

  if (!initData) {
    log.warn("API request without auth");
    return res.status(401).json({ error: "No auth data" });
  }

  const user = validateInitData(initData);
  if (!user) {
    log.warn("Invalid Telegram auth", { initDataLength: initData.length });
    return res.status(401).json({ error: "Invalid auth" });
  }

  req.tgUser = user;
  log.info("API auth", { userId: user.id, username: user.username, isAdmin: config.ADMINS.includes(user.id) });
  next();
}

/**
 * Admin-only middleware
 */
function adminMiddleware(req, res, next) {
  if (!config.ADMINS.includes(req.tgUser.id)) {
    return res.status(403).json({ error: "Admin only" });
  }
  next();
}

module.exports = { authMiddleware, adminMiddleware, validateInitData };