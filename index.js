// ============================================
// AIRSOFT CLUB BOT v2 + Mini App Server
// ============================================

const { Bot, session, InlineKeyboard } = require("grammy");
const config = require("./config");
const log = require("./utils/logger");
const { initDB } = require("./database/connection");
const { q1 } = require("./database/helpers");
const { esc } = require("./utils/markdown");
const { createPlayer } = require("./services/players");
const { handleGeoCheckin, handleGameGeo } = require("./handlers/games");
const { handleTextSteps } = require("./handlers/admin");
const { createServer } = require("./api/server");

// ---- Create bot ----
const bot = new Bot(config.BOT_TOKEN);

// ---- Session ----
bot.use(session({ initial: () => ({ step: null, data: {} }) }));

// ---- Logging middleware ----
bot.use(async (ctx, next) => {
  log.debug("Update", { uid: ctx.from?.id, type: ctx.updateType });
  await next();
});

// ============================================
// Register all bot handlers
// ============================================

require("./handlers/profile").register(bot);
require("./handlers/games").register(bot);
require("./handlers/manage").register(bot);
require("./handlers/rounds").register(bot);
require("./handlers/admin").register(bot);
require("./handlers/voting").register(bot);

// ============================================
// /start — тільки кнопка "Увійти"
// ============================================

bot.command("start", async (ctx) => {
  const tgId = ctx.from.id;
  log.info("CMD /start", { tgId, username: ctx.from.username });

  const existing = await q1("SELECT * FROM players WHERE telegram_id = ?", [tgId]);

  const webappUrl = process.env.WEBAPP_URL || "https://yourdomain.com";

  if (existing) {
    const kb = new InlineKeyboard().webApp("🎯 Увійти", webappUrl);
    return ctx.reply(
      `👋 Вітаю, *${esc(existing.nickname)}*\\!\n\nНатисни кнопку щоб відкрити додаток:`,
      { parse_mode: "MarkdownV2", reply_markup: kb }
    );
  }

  // Not registered — still show app button (registration happens in app)
  const kb = new InlineKeyboard().webApp("🎯 Увійти", webappUrl);
  return ctx.reply(
    `🎯 *Ласкаво просимо до Airsoft Club\\!*\n\nНатисни кнопку щоб зареєструватись та увійти:`,
    { parse_mode: "MarkdownV2", reply_markup: kb }
  );
});

// ============================================
// Registration callbacks (for bot-based flow)
// ============================================

bot.callbackQuery("has_team_yes", async (ctx) => {
  const { q } = require("./database/helpers");
  const teams = await q("SELECT id,name FROM teams ORDER BY name");
  if (!teams.length) { await createPlayer(ctx, bot, null); return ctx.answerCallbackQuery(); }
  const kb = new InlineKeyboard();
  teams.forEach((t) => kb.text(t.name, `sel_team_${t.id}`).row());
  kb.text("🚫 Без команди", "has_team_no").row();
  await ctx.answerCallbackQuery();
  return ctx.editMessageText("Обери команду:", { reply_markup: kb });
});

bot.callbackQuery("has_team_no", async (ctx) => {
  await createPlayer(ctx, bot, null);
  return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^sel_team_/, async (ctx) => {
  const tid = parseInt(ctx.callbackQuery.data.replace("sel_team_", ""));
  await createPlayer(ctx, bot, tid);
  return ctx.answerCallbackQuery();
});

// ============================================
// Text handler
// ============================================

bot.on("message:text", async (ctx) => {
  const step = ctx.session.step;
  const text = ctx.message.text;

  const webappUrl = process.env.WEBAPP_URL || "https://yourdomain.com";

  // No step — show "Увійти" button
  if (!step) {
    const p = await q1("SELECT nickname FROM players WHERE telegram_id=?", [ctx.from.id]);
    const kb = new InlineKeyboard().webApp("🎯 Увійти", webappUrl);
    if (p) {
      return ctx.reply(
        `👋 *${esc(p.nickname)}*, натисни кнопку щоб відкрити додаток:`,
        { parse_mode: "MarkdownV2", reply_markup: kb }
      );
    }
    return ctx.reply(
      `🎯 Натисни кнопку щоб увійти:`,
      { reply_markup: kb }
    );
  }

  // Game creation steps (from bot admin flow)
  if (step === "cg_date") { ctx.session.data.date = text; ctx.session.step = "cg_time"; return ctx.reply("🕐 Введи час \\(наприклад: 10:00\\):", { parse_mode: "MarkdownV2" }); }
  if (step === "cg_time") { ctx.session.data.time = text; ctx.session.step = "cg_loc"; return ctx.reply("📍 Введи локацію:"); }
  if (step === "cg_loc") {
    ctx.session.data.location = text;
    ctx.session.step = "cg_mode";
    return ctx.reply("🎯 Обери формат гри:", {
      reply_markup: new InlineKeyboard()
        .text("⚔️ Team vs Team", "gmode_team_vs_team").row()
        .text("🎲 Random Teams", "gmode_random_teams").row()
        .text("👤 FFA", "gmode_ffa").row()
        .text("❌ Скасувати", "m_back"),
    });
  }

  // Admin text steps
  const handled = await handleTextSteps(ctx);
  if (handled !== false) return;
});

// ============================================
// Location handler
// ============================================

bot.on("message:location", async (ctx) => {
  if (ctx.session.step === "geo_checkin") return handleGeoCheckin(ctx);
  if (ctx.session.step === "cg_geo") return handleGameGeo(ctx, bot);
});

// ============================================
// Error handling
// ============================================

bot.catch((err) => {
  log.error("Bot error", { msg: err.message, stack: err.stack?.substring(0, 300) });
});

process.on("SIGINT", async () => { log.info("Shutdown..."); await bot.stop(); process.exit(0); });
process.on("SIGTERM", async () => { await bot.stop(); process.exit(0); });
process.on("uncaughtException", (e) => { log.error("UncaughtEx", { msg: e.message }); process.exit(1); });
process.on("unhandledRejection", (r) => { log.error("UnhandledRej", { r: String(r).substring(0, 300) }); });

// ============================================
// START — Bot + Express
// ============================================

async function main() {
  log.info("=============================");
  log.info("  AIRSOFT CLUB BOT + APP v2  ");
  log.info("=============================");

  await initDB();

  const pc = await q1("SELECT COUNT(*) as c FROM players");
  const tc = await q1("SELECT COUNT(*) as c FROM teams");
  const gc = await q1("SELECT COUNT(*) as c FROM games");
  log.info("DB", { players: pc?.c || 0, teams: tc?.c || 0, games: gc?.c || 0 });

  // Start Express API server
  const app = createServer();
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    log.info(`Express server on port ${PORT}`);
    log.info(`Mini App URL: http://localhost:${PORT}`);
  });

  // Start Telegram bot
  bot.start();
  log.info("Bot running!");
}

main().catch((e) => {
  log.error("Fatal", { msg: e.message });
  process.exit(1);
});