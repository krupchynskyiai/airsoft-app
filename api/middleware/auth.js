const crypto = require("crypto");
const config = require("../../config");
const log = require("../../utils/logger");
const { q1, ins } = require("../../database/helpers");
const { syncTelegramUsernameWithDbPlayer } = require("../../services/playerTelegramUsernameSync");
const {
  normalizeTelegramUsername,
  resolveTelegramUsername,
  telegramUsernameFromNickname,
} = require("../../utils/telegramUsername");

async function backfillTelegramUsernameColumn(player) {
  if (!player?.id) return;
  // Реальні акаунти: username береться лише з Telegram API (sync), не з ніка
  if (player.telegram_id != null && Number(player.telegram_id) !== 0) return;
  const cur = player.telegram_username;
  if (cur != null && String(cur).trim() !== "") return;
  const derived = telegramUsernameFromNickname(player.nickname);
  if (!derived) return;
  try {
    await ins(
      "UPDATE players SET telegram_username=? WHERE id=? AND (telegram_username IS NULL OR telegram_username='')",
      [derived, player.id],
    );
    player.telegram_username = derived;
  } catch (e) {
    // column missing or constraint
  }
}

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

  // If not found, try to attach an existing placeholder row by telegram username
  if (tgUser.username) {
    const uname = normalizeTelegramUsername(tgUser.username);
    if (uname) {
      try {
        player = await q1(
          "SELECT * FROM players WHERE telegram_username=? LIMIT 1",
          [uname],
        );
      } catch (e) {
        // ignore if schema doesn't support telegram_username yet
      }

      // Backward compatible: some pre-registered rows may have nickname as @username
      if (!player) {
        try {
          player = await q1(
            "SELECT * FROM players WHERE nickname IN (?,?) AND (telegram_id IS NULL OR telegram_id=0) LIMIT 1",
            [uname, `@${uname}`],
          );
        } catch (e) {
          // ignore if telegram_id is NOT NULL in schema
        }
      }

      if (player) {
        try {
          await ins(
            "UPDATE players SET telegram_id=?, telegram_username=? WHERE id=?",
            [tgUser.id, uname, player.id],
          );
          player = await q1("SELECT * FROM players WHERE id=?", [player.id]);
          log.info("Player attached to placeholder", {
            telegramId: tgUser.id,
            username: uname,
            playerId: player.id,
          });
        } catch (e) {
          // If schema doesn't allow NULL telegram_id / doesn't have telegram_username — just fall back to auto-create
          player = null;
        }
      }
    }
  }

  // auto-register player if not exists
  if (!player) {
    const nickname =
      tgUser.username ||
      `${tgUser.first_name || ""}${tgUser.last_name || ""}`.trim() ||
      `player_${tgUser.id}`;

    const uname = resolveTelegramUsername(tgUser.username, nickname);

    // Prefer storing telegram_username if column exists (best-effort)
    let r;
    try {
      r = await ins(
        "INSERT INTO players (telegram_id,telegram_username,nickname,rating,games_played,wins,total_deaths) VALUES (?,?,?,?,0,0,0)",
        [tgUser.id, uname, nickname],
      );
    } catch (e) {
      r = await ins(
        "INSERT INTO players (telegram_id,nickname,rating,games_played,wins,total_deaths) VALUES (?,?,0,0,0,0)",
        [tgUser.id, nickname],
      );
    }

    player = await q1("SELECT * FROM players WHERE id=?", [r.insertId]);

    log.info("Player auto-created", {
      telegramId: tgUser.id,
      playerId: player.id,
    });
  }

  if (player) {
    await syncTelegramUsernameWithDbPlayer(player, tgUser);
    await backfillTelegramUsernameColumn(player);
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