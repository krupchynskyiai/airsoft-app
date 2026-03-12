const { InlineKeyboard } = require("grammy");
const { q, q1, ins } = require("../database/helpers");
const { esc } = require("../utils/markdown");
const { sendMenu } = require("../menus/main");
const config = require("../config");
const log = require("../utils/logger");

function register(bot) {
  // ---- Create team ----
  bot.callbackQuery("m_create_team", async (ctx) => {
    if (!config.isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔", show_alert: true });
    ctx.session.step = "ct_name";
    await ctx.answerCallbackQuery();
    return ctx.editMessageText("🏠 Назва команди:", {
      reply_markup: new InlineKeyboard().text("❌ Скасувати", "m_back"),
    });
  });

  // ---- Create season ----
  bot.callbackQuery("m_create_season", async (ctx) => {
    if (!config.isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔", show_alert: true });
    ctx.session.step = "cs_name";
    await ctx.answerCallbackQuery();
    return ctx.editMessageText("📅 Назва сезону:", {
      reply_markup: new InlineKeyboard().text("❌ Скасувати", "m_back"),
    });
  });

  // ---- Add points ----
  bot.callbackQuery("m_add_pts", async (ctx) => {
    if (!config.isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔", show_alert: true });
    ctx.session.step = "ap_nick";
    ctx.session.data = {};
    await ctx.answerCallbackQuery();
    return ctx.editMessageText("👤 Нікнейм гравця:", {
      reply_markup: new InlineKeyboard().text("❌ Скасувати", "m_back"),
    });
  });

  // ---- Remove points ----
  bot.callbackQuery("m_rm_pts", async (ctx) => {
    if (!config.isAdmin(ctx)) return ctx.answerCallbackQuery({ text: "⛔", show_alert: true });
    ctx.session.step = "rp_nick";
    ctx.session.data = {};
    await ctx.answerCallbackQuery();
    return ctx.editMessageText("👤 Нікнейм гравця:", {
      reply_markup: new InlineKeyboard().text("❌ Скасувати", "m_back"),
    });
  });
}

// ---- Text step handlers (called from index.js) ----
async function handleTextSteps(ctx) {
  const step = ctx.session.step;
  const text = ctx.message.text;

  if (step === "ct_name") {
    try {
      const r = await ins("INSERT INTO teams (name,rating) VALUES (?,0)", [text.trim()]);
      log.info("Team created", { name: text.trim(), id: r.insertId });
      ctx.session.step = null;
      await ctx.reply(`✅ Команда *${esc(text.trim())}* створена\\!`, { parse_mode: "MarkdownV2" });
    } catch (e) {
      await ctx.reply(`❌ ${esc(e.message)}`, { parse_mode: "MarkdownV2" });
    }
    ctx.session.step = null;
    return sendMenu(ctx, "Обери дію:");
  }

  if (step === "cs_name") {
    await ins("UPDATE seasons SET is_active=0 WHERE is_active=1");
    const today = new Date().toISOString().split("T")[0];
    await ins("INSERT INTO seasons (name,start_date,is_active) VALUES (?,?,1)", [text.trim(), today]);
    log.info("Season created", { name: text.trim() });
    ctx.session.step = null;
    const msg = `📅 *Новий сезон\\!*\n🏆 ${esc(text.trim())}\n📆 ${esc(today)}`;
    if (config.CHANNEL_ID) {
      try { await ctx.api.sendMessage(config.CHANNEL_ID, msg, { parse_mode: "MarkdownV2" }); } catch (e) {}
    }
    await ctx.reply(msg, { parse_mode: "MarkdownV2" });
    return sendMenu(ctx, "Обери дію:");
  }

  if (step === "ap_nick") { ctx.session.data.nick = text.trim(); ctx.session.step = "ap_amt"; return ctx.reply("🔢 Скільки очок додати?"); }
  if (step === "ap_amt") {
    const amt = parseInt(text);
    if (isNaN(amt)) return ctx.reply("❌ Число\\!", { parse_mode: "MarkdownV2" });
    const p = await q1("SELECT id,rating,nickname FROM players WHERE nickname=?", [ctx.session.data.nick]);
    if (!p) { ctx.session.step = null; return ctx.reply("❌ Не знайдено\\.", { parse_mode: "MarkdownV2" }); }
    await ins("UPDATE players SET rating=? WHERE id=?", [p.rating + amt, p.id]);
    log.info("Points added", { nickname: p.nickname, amount: amt });
    ctx.session.step = null; ctx.session.data = {};
    await ctx.reply(`✅ *${esc(p.nickname)}* \\+${amt}pts \\= ${p.rating + amt}`, { parse_mode: "MarkdownV2" });
    return sendMenu(ctx, "Обери дію:");
  }

  if (step === "rp_nick") { ctx.session.data.nick = text.trim(); ctx.session.step = "rp_amt"; return ctx.reply("🔢 Скільки очок зняти?"); }
  if (step === "rp_amt") {
    const amt = parseInt(text);
    if (isNaN(amt)) return ctx.reply("❌ Число\\!", { parse_mode: "MarkdownV2" });
    const p = await q1("SELECT id,rating,nickname FROM players WHERE nickname=?", [ctx.session.data.nick]);
    if (!p) { ctx.session.step = null; return ctx.reply("❌ Не знайдено\\.", { parse_mode: "MarkdownV2" }); }
    const nr = Math.max(0, p.rating - amt);
    await ins("UPDATE players SET rating=? WHERE id=?", [nr, p.id]);
    log.info("Points removed", { nickname: p.nickname, amount: amt });
    ctx.session.step = null; ctx.session.data = {};
    await ctx.reply(`✅ *${esc(p.nickname)}* \\-${amt}pts \\= ${nr}`, { parse_mode: "MarkdownV2" });
    return sendMenu(ctx, "Обери дію:");
  }

  return false; // not handled
}

module.exports = { register, handleTextSteps };