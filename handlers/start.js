const { q1 } = require("../database/helpers");
const { syncTelegramUsernameWithDbPlayer } = require("../services/playerTelegramUsernameSync");
const { esc } = require("../utils/markdown");
const { sendMenu } = require("../menus/main");
const log = require("../utils/logger");

function register(bot) {
  bot.command("start", async (ctx) => {
    const tgId = ctx.from.id;
    log.info("CMD /start", { tgId, username: ctx.from.username });

    const ex = await q1("SELECT * FROM players WHERE telegram_id = ?", [tgId]);

    if (ex) {
      await syncTelegramUsernameWithDbPlayer(ex, ctx.from);
      return sendMenu(ctx, `👋 *${esc(ex.nickname)}*, обери дію:`);
    }

    ctx.session.step = "reg_nick";
    return ctx.reply(
      `🎯 *Ласкаво просимо до Airsoft Club\\!*\n\nВведи свій нікнейм:`,
      { parse_mode: "MarkdownV2" }
    );
  });
}

module.exports = { register };