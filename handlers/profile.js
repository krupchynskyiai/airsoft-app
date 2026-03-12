const { InlineKeyboard } = require("grammy");
const { q, q1 } = require("../database/helpers");
const { esc } = require("../utils/markdown");
const { mainMenu } = require("../menus/main");
const log = require("../utils/logger");
const MODE_LABELS = require("../constants/gameModes");

const backBtn = () => new InlineKeyboard().text("🔙 Меню", "m_back");

function register(bot) {
  // ---- Profile ----
  bot.callbackQuery("m_profile", async (ctx) => {
    const tgId = ctx.from.id;
    const p = await q1(
      "SELECT p.*, t.name AS tn FROM players p LEFT JOIN teams t ON p.team_id=t.id WHERE p.telegram_id=?",
      [tgId]
    );
    if (!p) return ctx.answerCallbackQuery({ text: "❌ Не зареєстрований", show_alert: true });

    const badges = await q("SELECT badge_name,badge_emoji FROM player_badges WHERE player_id=?", [p.id]);
    const bs = badges.length
      ? badges.map((b) => `${b.badge_emoji} ${esc(b.badge_name)}`).join(", ")
      : "Немає";
    const kd = p.total_deaths > 0 ? (p.total_kills / p.total_deaths).toFixed(2) : p.total_kills;

    log.info("Profile", { tgId, nickname: p.nickname });

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(
      `🪖 *Player №${String(p.id).padStart(3, "0")}*\n` +
        `👤 ${esc(p.nickname)}\n🏠 ${esc(p.tn || "Без команди")}\n\n` +
        `🎮 Ігор: ${p.games_played} \n` + `🏆 Перемог: ${p.wins}\n` +
        `💀 Deaths: ${p.total_deaths} \n` +
        `⭐ MVP: ${p.mvp_count} \n` + `📊 Rating: ${p.rating}\n\n` +
        `🎖 ${bs}`,
      { parse_mode: "MarkdownV2", reply_markup: backBtn() }
    );
  });

  // ---- Leaderboard ----
  bot.callbackQuery("m_leaderboard", async (ctx) => {
    const ps = await q(
      "SELECT nickname,rating,wins,total_kills,total_deaths,games_played FROM players ORDER BY rating DESC LIMIT 15"
    );
    let msg = "🏆 *TOP PLAYERS*\n\n";
    if (!ps.length) msg += "Порожній\\.";
    else
      ps.forEach((p, i) => {
        const m = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}\\.`;
        msg += `${m} *${esc(p.nickname)}* — ${p.rating}pts \\(${p.total_deaths} D\\)\n`;
      });
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(msg, { parse_mode: "MarkdownV2", reply_markup: backBtn() });
  });

  // ---- Teams ----
  bot.callbackQuery("m_teams", async (ctx) => {
    const ts = await q("SELECT name,rating FROM teams ORDER BY rating DESC LIMIT 10");
    let msg = "🏆 *TOP TEAMS*\n\n";
    if (!ts.length) msg += "Немає команд\\.";
    else
      ts.forEach((t, i) => {
        const m = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}\\.`;
        msg += `${m} *${esc(t.name)}* — ${t.rating}pts\n`;
      });
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(msg, { parse_mode: "MarkdownV2", reply_markup: backBtn() });
  });

  // ---- Season ----
  bot.callbackQuery("m_season", async (ctx) => {
    const s = await q1("SELECT * FROM seasons WHERE is_active=1 LIMIT 1");
    if (!s) {
      await ctx.answerCallbackQuery();
      return ctx.editMessageText("📅 Немає активного сезону\\.", {
        parse_mode: "MarkdownV2",
        reply_markup: backBtn(),
      });
    }
    const tp = await q(
      "SELECT p.nickname,ss.season_rating,ss.season_kills FROM season_stats ss JOIN players p ON ss.player_id=p.id WHERE ss.season_id=? ORDER BY ss.season_rating DESC LIMIT 5",
      [s.id]
    );
    let msg = `📅 *${esc(s.name)}*\n📆 ${esc(String(s.start_date))}\n\n🏆 Лідери:\n`;
    if (tp.length)
      tp.forEach((p, i) => {
        msg += `${i + 1}\\. ${esc(p.nickname)} — ${p.season_rating}pts \\(${p.season_kills}K\\)\n`;
      });
    else msg += "Немає даних\\.\n";
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(msg, { parse_mode: "MarkdownV2", reply_markup: backBtn() });
  });

  // ---- My Games ----
  bot.callbackQuery("m_my_games", async (ctx) => {
    const tgId = ctx.from.id;
    const p = await q1("SELECT id FROM players WHERE telegram_id=?", [tgId]);
    if (!p) return ctx.answerCallbackQuery({ text: "❌ Не зареєстрований", show_alert: true });

    const games = await q(
      "SELECT g.id,g.date,g.time,g.game_mode,g.status,gp.attendance FROM game_players gp JOIN games g ON gp.game_id=g.id WHERE gp.player_id=? ORDER BY g.created_at DESC LIMIT 10",
      [p.id]
    );
    let msg = "🎮 *Мої ігри*\n\n";
    if (!games.length) msg += "Ти ще не брав участі\\.\n";
    else
      games.forEach((g) => {
        const st =
          g.status === "finished"
            ? "✅"
            : g.status === "active"
              ? "🔴 LIVE"
              : g.status === "checkin"
                ? "📍"
                : "⏳";
        const att = g.attendance === "checked_in" ? " ✓" : "";
        msg += `${st} Гра \\#${g.id} — ${esc(g.date)} ${esc(g.time || "")} \\[${esc(MODE_LABELS[g.game_mode])}\\]${att}\n`;
      });
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(msg, { parse_mode: "MarkdownV2", reply_markup: backBtn() });
  });

  // ---- Back to menu ----
  bot.callbackQuery("m_back", async (ctx) => {
    ctx.session.step = null;
    ctx.session.data = {};
    const p = await q1("SELECT nickname FROM players WHERE telegram_id=?", [ctx.from.id]);
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(`👋 *${esc(p?.nickname || "Гравець")}*, обери дію:`, {
      parse_mode: "MarkdownV2",
      reply_markup: mainMenu(ctx),
    });
  });
}

module.exports = { register };