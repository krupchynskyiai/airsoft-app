const { q1, ins } = require("../database/helpers");
const log = require("../utils/logger");

function register(bot) {
  bot.callbackQuery(/^vote_mvp_/, async (ctx) => {
    const parts = ctx.callbackQuery.data.replace("vote_mvp_", "").split("_g");
    const cid = parseInt(parts[0]);
    const gid = parseInt(parts[1]);
    const tgId = ctx.from.id;

    const p = await q1("SELECT id FROM players WHERE telegram_id=?", [tgId]);
    if (!p) return ctx.answerCallbackQuery({ text: "❌", show_alert: true });

    const ev = await q1("SELECT id FROM mvp_votes WHERE game_id=? AND voter_id=?", [gid, p.id]);
    if (ev) return ctx.answerCallbackQuery({ text: "⚠️ Вже голосував!", show_alert: true });

    await ins("INSERT INTO mvp_votes (game_id,voter_id,candidate_id) VALUES (?,?,?)", [gid, p.id, cid]);
    log.info("MVP vote", { gid, voter: p.id, candidate: cid });
    return ctx.answerCallbackQuery({ text: "✅ Голос зараховано!" });
  });
}

module.exports = { register };