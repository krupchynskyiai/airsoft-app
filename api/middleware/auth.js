const crypto = require("crypto");
const config = require("../../config");
const log = require("../../utils/logger");
const { q1, ins } = require("../../database/helpers");

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
 * Load or create player
 */
async function loadPlayerByTelegram(tgUser) {
  let player = await q1(
    "SELECT * FROM players WHERE telegram_id=?",
    [tgUser.id]
  );

  // auto-register player if not exists
  if (!player) {
    const nickname =
      tgUser.username ||
      `${tgUser.first_name || ""}${tgUser.last_name || ""}`.trim() ||
      `player_${tgUser.id}`;

    const r = await ins(
      "INSERT INTO players (telegram_id,nickname,rating,games_played,wins,total_deaths) VALUES (?,?,0,0,0,0)",
      [tgUser.id, nickname]
    );

    player = await q1("SELECT * FROM players WHERE id=?", [r.insertId]);

    log.info("Player auto-created", {
      telegramId: tgUser.id,
      playerId: player.id,
    });
  }

  return player;
}

/**
 * Express middleware — validates TG auth or allows dev mode
 */
async function authMiddleware(req, res, next) {
  try {

    let tgUser = null;

    // ---- DEV MODE ----
    if (process.env.DEV_MODE === "true") {
      tgUser = {
        id: parseInt(process.env.DEV_USER_ID || config.ADMINS[0] || 0),
        first_name: "Dev",
        last_name: "User",
        username: "dev_user",
      };

      log.warn("DEV AUTH BYPASS", { userId: tgUser.id });
    } else {

      const initData = req.headers["x-telegram-init-data"];

      if (!initData) {
        log.warn("API request without auth");
        return res.status(401).json({ error: "No auth data" });
      }

      tgUser = validateInitData(initData);

      if (!tgUser) {
        log.warn("Invalid Telegram auth");
        return res.status(401).json({ error: "Invalid auth" });
      }

      log.info("API auth", {
        userId: tgUser.id,
        username: tgUser.username,
        isAdmin: config.ADMINS.includes(tgUser.id),
      });
    }

    const player = await loadPlayerByTelegram(tgUser);

    req.tgUser = tgUser;
    req.player = player;

    next();

  } catch (e) {
    log.error("Auth middleware error", e);
    res.status(500).json({ error: "Auth error" });
  }
}

/**
 * Admin-only middleware
 */
function adminMiddleware(req, res, next) {

  if (process.env.DEV_MODE === "true") {
    return next();
  }

  if (!config.ADMINS.includes(req.tgUser.id)) {
    return res.status(403).json({ error: "Admin only" });
  }

  next();
}

module.exports = {
  authMiddleware,
  adminMiddleware,
  validateInitData,
};