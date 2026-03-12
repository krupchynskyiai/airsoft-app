const { InlineKeyboard } = require("grammy");
const { q, q1, ins } = require("../database/helpers");
const { esc } = require("../utils/markdown");
const config = require("../config");
const log = require("../utils/logger");
const MODE_LABELS = require("../constants/gameModes");

function register(bot) {
  const backBtn = () => new InlineKeyboard().text("🔙 Меню", "m_back");

  // ---- Manage games list ----
  bot.callbackQuery("m_manage_games", async (ctx) => {
    if (!config.isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔", show_alert: true });

    const games = await q("SELECT * FROM games WHERE status IN ('upcoming','checkin','active') ORDER BY created_at DESC");
    if (!games.length) {
      await ctx.answerCallbackQuery();
      return ctx.editMessageText("Немає активних ігор\\.", { parse_mode: "MarkdownV2", reply_markup: backBtn() });
    }

    const kb = new InlineKeyboard();
    games.forEach((g) => {
      const st = g.status === "active" ? "🔴" : g.status === "checkin" ? "📍" : "⏳";
      kb.text(`${st} #${g.id} ${g.date}`, `gmng_${g.id}`).row();
    });
    kb.text("🔙 Меню", "m_back").row();

    await ctx.answerCallbackQuery();
    return ctx.editMessageText("🎮 Обери гру:", { reply_markup: kb });
  });

  // ---- Game management panel ----
  bot.callbackQuery(/^gmng_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gmng_", ""));
    const g = await q1("SELECT * FROM games WHERE id=?", [gid]);
    if (!g) return;

    const cnt = await q1("SELECT COUNT(*) as c FROM game_players WHERE game_id=?", [gid]);
    const chk = await q1("SELECT COUNT(*) as c FROM game_players WHERE game_id=? AND attendance='checked_in'", [gid]);

    let msg =
      `🎮 *Гра \\#${gid}*\n` +
      `📅 ${esc(g.date)} ${esc(g.time || "")}\n` +
      `📍 ${esc(g.location)}\n` +
      `🎯 ${esc(MODE_LABELS[g.game_mode])} \\| ${g.total_rounds} раундів\n` +
      `👥 Записано: ${cnt.c} \\| Check\\-in: ${chk.c}\n` +
      `📊 Статус: *${esc(g.status)}* \\| Раунд: ${g.current_round}/${g.total_rounds}`;

    const kb = new InlineKeyboard();

    if (g.status === "upcoming") {
      kb.text("📍 Відкрити check-in", "gcheckin_" + gid).row();
      if (g.game_mode === "random_teams") kb.text("🎲 Розподілити команди", "gshuffle_" + gid).row();
      kb.text("▶️ Почати гру", "gstart_" + gid).row();
    }
    if (g.status === "checkin") {
      kb.text("👥 Хто прийшов", "gattend_" + gid).row();
      if (g.game_mode === "random_teams") kb.text("🎲 Розподілити команди", "gshuffle_" + gid).row();
      kb.text("▶️ Почати гру", "gstart_" + gid).row();
    }
    if (g.status === "active") {
      kb.text("🔫 Панель раунду", "ground_panel_" + gid).row();
      kb.text("⏭ Завершити раунд", "gend_round_" + gid).row();
      kb.text("🏁 Завершити гру", "gfinish_" + gid).row();
    }

    kb.text("❌ Скасувати гру", "gcancel_" + gid).row();
    kb.text("🔙 Назад", "m_manage_games").row();

    await ctx.answerCallbackQuery();
    return ctx.editMessageText(msg, { parse_mode: "MarkdownV2", reply_markup: kb });
  });

  // ---- Open check-in ----
  bot.callbackQuery(/^gcheckin_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gcheckin_", ""));
    await ins("UPDATE games SET status='checkin' WHERE id=?", [gid]);
    log.info("Check-in opened", { gid });

    const g = await q1("SELECT * FROM games WHERE id=?", [gid]);
    const checkinKb = new InlineKeyboard().text("📍 Я на місці (check-in)", "player_checkin_" + gid);
    const ann = `📍 *Check\\-in відкрито\\!*\n\n🎮 Гра \\#${gid} — ${esc(g.date)} ${esc(g.time || "")}\n📍 ${esc(g.location)}\n\nНатисни кнопку коли будеш на місці:`;

    if (config.CHANNEL_ID) {
      try { await bot.api.sendMessage(config.CHANNEL_ID, ann, { parse_mode: "MarkdownV2", reply_markup: checkinKb }); } catch (e) {}
    }
    await ctx.answerCallbackQuery({ text: "✅ Check-in відкрито!" });
    return ctx.reply(ann, { parse_mode: "MarkdownV2", reply_markup: checkinKb });
  });

  // ---- Attendance list ----
  bot.callbackQuery(/^gattend_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gattend_", ""));
    const gps = await q("SELECT p.nickname, gp.attendance, gp.game_team FROM game_players gp JOIN players p ON gp.player_id=p.id WHERE gp.game_id=? ORDER BY gp.attendance DESC, p.nickname", [gid]);
    let msg = `👥 *Присутність — Гра \\#${gid}*\n\n`;
    gps.forEach((gp) => {
      const icon = gp.attendance === "checked_in" ? "✅" : "⬜";
      const tm = gp.game_team ? ` \\[${esc(gp.game_team)}\\]` : "";
      msg += `${icon} ${esc(gp.nickname)}${tm}\n`;
    });
    await ctx.answerCallbackQuery();
    return ctx.editMessageText(msg, { parse_mode: "MarkdownV2", reply_markup: new InlineKeyboard().text("🔙 Назад", "gmng_" + gid) });
  });

  // ---- Shuffle random teams ----
  bot.callbackQuery(/^gshuffle_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gshuffle_", ""));
    const checkedIn = await q("SELECT gp.id, p.nickname FROM game_players gp JOIN players p ON gp.player_id=p.id WHERE gp.game_id=? AND gp.attendance='checked_in'", [gid]);

    if (checkedIn.length < 2) return ctx.answerCallbackQuery({ text: "❌ Мінімум 2", show_alert: true });

    const shuffled = checkedIn.sort(() => Math.random() - 0.5);
    const half = Math.ceil(shuffled.length / 2);

    let msgA = "🔵 *Team A:*\n", msgB = "🔴 *Team B:*\n";
    for (let i = 0; i < shuffled.length; i++) {
      const team = i < half ? "A" : "B";
      await ins("UPDATE game_players SET game_team=? WHERE id=?", [team, shuffled[i].id]);
      if (team === "A") msgA += `  ${esc(shuffled[i].nickname)}\n`;
      else msgB += `  ${esc(shuffled[i].nickname)}\n`;
    }

    log.info("Teams shuffled", { gid, total: shuffled.length });
    await ctx.answerCallbackQuery({ text: "✅ Розподілено!" });
    return ctx.editMessageText(`🎲 *Розподіл — Гра \\#${gid}*\n\n${msgA}\n${msgB}`, {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("🔄 Перемішати", "gshuffle_" + gid).row().text("🔙 Назад", "gmng_" + gid),
    });
  });

  // ---- Cancel game ----
  bot.callbackQuery(/^gcancel_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gcancel_", ""));
    await ins("UPDATE games SET status='cancelled' WHERE id=?", [gid]);
    log.info("Game cancelled", { gid });
    await ctx.answerCallbackQuery({ text: "❌ Скасовано" });
    return ctx.editMessageText(`❌ Гру \\#${gid} скасовано\\.`, { parse_mode: "MarkdownV2", reply_markup: backBtn() });
  });
}

module.exports = { register };