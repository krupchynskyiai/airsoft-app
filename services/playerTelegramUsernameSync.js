const { ins } = require("../database/helpers");
const log = require("../utils/logger");
const { normalizeTelegramUsername } = require("../utils/telegramUsername");

/**
 * Keeps players.telegram_username aligned with Telegram for this telegram_id.
 * Call whenever you have a fresh User / ctx.from from Telegram (WebApp initData, bot updates).
 * If the user removes their public username, we clear the column (NULL).
 */
async function syncTelegramUsernameWithDbPlayer(player, tgFrom) {
  if (!player?.id || tgFrom?.id == null) return;
  if (Number(player.telegram_id) !== Number(tgFrom.id)) return;

  const apiU = normalizeTelegramUsername(tgFrom.username);
  const cur =
    player.telegram_username != null && String(player.telegram_username).trim() !== ""
      ? normalizeTelegramUsername(player.telegram_username)
      : null;

  try {
    if (apiU) {
      if (cur !== apiU) {
        await ins("UPDATE players SET telegram_username=? WHERE id=?", [apiU, player.id]);
        player.telegram_username = apiU;
        log.info("telegram_username synced from Telegram", {
          playerId: player.id,
          telegram_username: apiU,
        });
      }
    } else if (cur != null) {
      await ins("UPDATE players SET telegram_username=NULL WHERE id=?", [player.id]);
      player.telegram_username = null;
      log.info("telegram_username cleared (not set in Telegram)", {
        playerId: player.id,
      });
    }
  } catch (e) {
    log.warn("telegram_username sync failed", {
      playerId: player.id,
      error: e.message,
    });
  }
}

module.exports = { syncTelegramUsernameWithDbPlayer };
