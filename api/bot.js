const { Bot } = require("grammy");
const config = require("../config");
const { q1, ins } = require("../database/helpers");
const log = require("../utils/logger");

const bot = new Bot(config.BOT_TOKEN);

// Handle team application inline buttons from captain
bot.on("callback_query:data", async (ctx) => {
  const data = ctx.callbackQuery.data || "";
  if (!data.startsWith("team_app:")) return;

  const parts = data.split(":");
  if (parts.length !== 4) return;

  const [, teamIdStr, appIdStr, action] = parts;

  if (!["accept", "reject"].includes(action)) return;

  const teamId = parseInt(teamIdStr, 10);
  const appId = parseInt(appIdStr, 10);
  const tgId = ctx.from?.id;

  if (!teamId || !appId || !tgId) {
    return;
  }

  try {
    // Verify that caller is team captain
    const captain = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    const team = await q1(
      "SELECT captain_id FROM teams WHERE id = ?",
      [teamId],
    );

    if (!captain || !team || team.captain_id !== captain.id) {
      await ctx.answerCallbackQuery({
        text: "Лише капітан може приймати рішення",
        show_alert: true,
      });
      return;
    }

    const app = await q1(
      "SELECT * FROM team_applications WHERE id = ? AND team_id = ? AND status = 'pending'",
      [appId, teamId],
    );
    if (!app) {
      await ctx.answerCallbackQuery({
        text: "Заявку вже опрацьовано",
        show_alert: true,
      });
      return;
    }

    if (action === "accept") {
      const player = await q1(
        "SELECT team_id FROM players WHERE id = ?",
        [app.player_id],
      );
      if (player.team_id) {
        await ins(
          "UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE id = ?",
          [appId],
        );
        await ctx.answerCallbackQuery({
          text: "Гравець вже в іншій команді",
          show_alert: true,
        });
        return;
      }

      await ins(
        "UPDATE players SET team_id = ? WHERE id = ?",
        [teamId, app.player_id],
      );
      await ins(
        "UPDATE team_applications SET status = 'accepted', resolved_at = NOW() WHERE id = ?",
        [appId],
      );
      await ins(
        "UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE player_id = ? AND status = 'pending' AND id != ?",
        [app.player_id, appId],
      );

      log.info("Application accepted via bot", {
        teamId,
        playerId: app.player_id,
      });
      await ctx.answerCallbackQuery({ text: "Заявку прийнято ✅" });
    } else {
      await ins(
        "UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE id = ?",
        [appId],
      );
      log.info("Application rejected via bot", {
        teamId,
        playerId: app.player_id,
      });
      await ctx.answerCallbackQuery({ text: "Заявку скасовано ❌" });
    }

    // Optionally update message
    try {
      await ctx.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [] } });
    } catch {
      // ignore edit errors
    }
  } catch (e) {
    log.error("Team app callback error", { e: e.message });
    await ctx.answerCallbackQuery({
      text: "Сталася помилка, спробуй ще раз",
      show_alert: true,
    });
  }
});

module.exports = bot;