const { InlineKeyboard } = require("grammy");
const { q, q1, ins } = require("../database/helpers");
const { esc } = require("../utils/markdown");
const { haversine } = require("../utils/geo");
const config = require("../config");
const log = require("../utils/logger");

function register(bot) {
  // ---- Create game: start flow ----
  bot.callbackQuery("m_create_game", async (ctx) => {
    if (!config.isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔", show_alert: true });
    ctx.session.step = "cg_date";
    ctx.session.data = {};
    await ctx.answerCallbackQuery();
    return ctx.editMessageText("📅 Введи дату гри:", {
      reply_markup: new InlineKeyboard().text("❌ Скасувати", "m_back"),
    });
  });

  // ---- Game mode selection ----
  bot.callbackQuery(/^gmode_/, async (ctx) => {
    const mode = ctx.callbackQuery.data.replace("gmode_", "");
    ctx.session.data.game_mode = mode;
    ctx.session.step = "cg_rounds";
    await ctx.answerCallbackQuery();
    return ctx.editMessageText("🔄 Скільки раундів?", {
      reply_markup: new InlineKeyboard()
        .text("1", "grounds_1").text("3", "grounds_3").text("5", "grounds_5").text("7", "grounds_7")
        .row().text("❌ Скасувати", "m_back"),
    });
  });

  // ---- Round count ----
  bot.callbackQuery(/^grounds_/, async (ctx) => {
    const rounds = parseInt(ctx.callbackQuery.data.replace("grounds_", ""));
    ctx.session.data.total_rounds = rounds;
    ctx.session.step = "cg_geo";
    await ctx.answerCallbackQuery();
    return ctx.editMessageText("📍 Надішли геолокацію для check\\-in \\(або пропусти\\):", {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("⏭ Пропустити", "gskip_geo").row().text("❌ Скасувати", "m_back"),
    });
  });

  // ---- Skip geo ----
  bot.callbackQuery("gskip_geo", async (ctx) => {
    const { createGame } = require("../services/gameLogic");
    ctx.session.data.lat = null;
    ctx.session.data.lng = null;
    await createGame(ctx, bot);
    return ctx.answerCallbackQuery();
  });

  // ---- Join game ----
  bot.callbackQuery(/^join_game_/, async (ctx) => {
    const gid = parseInt(ctx.callbackQuery.data.replace("join_game_", ""));
    const tgId = ctx.from.id;
    const p = await q1("SELECT id,nickname,team_id FROM players WHERE telegram_id=?", [tgId]);
    if (!p) return ctx.answerCallbackQuery({ text: "❌ /start спочатку", show_alert: true });

    const ex = await q1("SELECT id FROM game_players WHERE game_id=? AND player_id=?", [gid, p.id]);
    if (ex) return ctx.answerCallbackQuery({ text: "⚠️ Ти вже записаний!", show_alert: true });

    await ins("INSERT INTO game_players (game_id, player_id, team_id) VALUES (?,?,?)", [gid, p.id, p.team_id]);
    const cnt = await q1("SELECT COUNT(*) as c FROM game_players WHERE game_id=?", [gid]);
    log.info("Player joined", { gid, nickname: p.nickname, total: cnt.c });

    await ctx.answerCallbackQuery({ text: "✅ Записано!" });
    return ctx.reply(
      `✅ *${esc(p.nickname)}* записався на гру \\#${gid}\\!\n👥 Всього: ${cnt.c}`,
      { parse_mode: "MarkdownV2" }
    );
  });

  // ---- Player check-in (button) ----
  bot.callbackQuery(/^player_checkin_/, async (ctx) => {
    const gid = parseInt(ctx.callbackQuery.data.replace("player_checkin_", ""));
    const tgId = ctx.from.id;
    const p = await q1("SELECT id,nickname FROM players WHERE telegram_id=?", [tgId]);
    if (!p) return ctx.answerCallbackQuery({ text: "❌ Не зареєстрований", show_alert: true });

    const gp = await q1("SELECT * FROM game_players WHERE game_id=? AND player_id=?", [gid, p.id]);
    if (!gp) return ctx.answerCallbackQuery({ text: "❌ Ти не записаний на цю гру", show_alert: true });
    if (gp.attendance === "checked_in") return ctx.answerCallbackQuery({ text: "✅ Ти вже відмітився!", show_alert: true });

    await ins("UPDATE game_players SET attendance='checked_in', checkin_time=NOW() WHERE game_id=? AND player_id=?", [gid, p.id]);
    log.info("Player checked in", { gid, nickname: p.nickname });
    return ctx.answerCallbackQuery({ text: `✅ ${p.nickname} — check-in!` });
  });

  // ---- Geo check-in button ----
  bot.callbackQuery(/^geo_checkin_/, async (ctx) => {
    const gid = parseInt(ctx.callbackQuery.data.replace("geo_checkin_", ""));
    ctx.session.step = "geo_checkin";
    ctx.session.data.geo_game_id = gid;
    await ctx.answerCallbackQuery({ text: "📍 Надішли геолокацію" });
    return ctx.reply("📍 Надішли свою геолокацію для check\\-in:", { parse_mode: "MarkdownV2" });
  });
}

// ---- Geo location handler (called from index.js) ----
async function handleGeoCheckin(ctx) {
  const gid = ctx.session.data.geo_game_id;
  const g = await q1("SELECT * FROM games WHERE id=?", [gid]);

  if (!g || !g.checkin_lat || !g.checkin_lng) {
    ctx.session.step = null;
    return ctx.reply("❌ Геолокація не налаштована\\.", { parse_mode: "MarkdownV2" });
  }

  const dist = haversine(
    ctx.message.location.latitude,
    ctx.message.location.longitude,
    parseFloat(g.checkin_lat),
    parseFloat(g.checkin_lng)
  );

  if (dist > g.checkin_radius) {
    return ctx.reply(
      `❌ Занадто далеко\\! \\(${Math.round(dist)}м, потрібно \\<${g.checkin_radius}м\\)`,
      { parse_mode: "MarkdownV2" }
    );
  }

  const p = await q1("SELECT id,nickname FROM players WHERE telegram_id=?", [ctx.from.id]);
  if (!p) return ctx.reply("❌");

  await ins("UPDATE game_players SET attendance='checked_in', checkin_time=NOW() WHERE game_id=? AND player_id=?", [gid, p.id]);
  ctx.session.step = null;
  log.info("Geo check-in", { gid, nickname: p.nickname, dist: Math.round(dist) });
  return ctx.reply(
    `✅ *${esc(p.nickname)}* — geo check\\-in\\! \\(${Math.round(dist)}м\\)`,
    { parse_mode: "MarkdownV2" }
  );
}

// ---- Geo for game creation (called from index.js) ----
async function handleGameGeo(ctx, bot) {
  const { createGame } = require("../services/gameLogic");
  ctx.session.data.lat = ctx.message.location.latitude;
  ctx.session.data.lng = ctx.message.location.longitude;
  return createGame(ctx, bot);
}

module.exports = { register, handleGeoCheckin, handleGameGeo };