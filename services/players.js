const { q, q1, ins } = require("../database/helpers");
const { resolveTelegramUsername } = require("../utils/telegramUsername");
const { syncTelegramUsernameWithDbPlayer } = require("./playerTelegramUsernameSync");
const { esc } = require("../utils/markdown");
const { sendMenu } = require("../menus/main");
const config = require("../config");
const log = require("../utils/logger");
const BADGES = require("../constants/badges");

async function createPlayer(ctx, bot, teamId) {
  const nick = ctx.session.data.nickname;
  const tgId = ctx.from.id;
  const uname = resolveTelegramUsername(ctx.from?.username, nick);

  try {
    let r;
    try {
      r = await ins(
        "INSERT INTO players (telegram_id,telegram_username,nickname,team_id,games_played,wins,mvp_count,total_kills,total_deaths,rating) VALUES (?,?,?,?,0,0,0,0,0,0)",
        [tgId, uname, nick, teamId],
      );
    } catch (e) {
      r = await ins(
        "INSERT INTO players (telegram_id,nickname,team_id,games_played,wins,mvp_count,total_kills,total_deaths,rating) VALUES (?,?,?,0,0,0,0,0,0)",
        [tgId, nick, teamId],
      );
    }

    const created = await q1("SELECT * FROM players WHERE id=?", [r.insertId]);
    if (created) await syncTelegramUsernameWithDbPlayer(created, ctx.from);

    let tn = "Без команди";
    if (teamId) {
      const t = await q1("SELECT name FROM teams WHERE id=?", [teamId]);
      tn = t?.name || tn;
    }

    ctx.session.step = null;
    ctx.session.data = {};

    await ctx.reply(
      `✅ *Реєстрація\\!*\n\n🪖 №${String(r.insertId).padStart(3, "0")}\n👤 ${esc(nick)}\n🏠 ${esc(tn)}`,
      { parse_mode: "MarkdownV2" }
    );
    return sendMenu(ctx, "Обери дію:");
  } catch (e) {
    log.error("Player creation failed", { tgId, nick, error: e.message });
    ctx.session.step = null;
    ctx.session.data = {};
    return ctx.reply(`❌ ${esc(e.message)}`, { parse_mode: "MarkdownV2" });
  }
}

async function checkBadges(pid, stats, bot) {
  const existing = new Set(
    (await q("SELECT badge_name FROM player_badges WHERE player_id=?", [pid])).map(
      (b) => b.badge_name
    )
  );

  for (const b of BADGES) {
    if (!existing.has(b.name) && b.check(stats)) {
      await ins(
        "INSERT INTO player_badges (player_id,badge_name,badge_emoji) VALUES (?,?,?)",
        [pid, b.name, b.emoji]
      );

      log.info("Badge!", { pid, badge: b.name });

      const p = await q1("SELECT telegram_id,nickname FROM players WHERE id=?", [pid]);
      if (!p) continue;

      const msg = `🔥 *${esc(p.nickname)}* — ${b.emoji} *${esc(b.name)}*\\!`;

      try {
        await bot.api.sendMessage(p.telegram_id, msg, { parse_mode: "MarkdownV2" });
      } catch (e) {}

      if (config.CHANNEL_ID) {
        try {
          await bot.api.sendMessage(config.CHANNEL_ID, msg, { parse_mode: "MarkdownV2" });
        } catch (e) {}
      }
    }
  }
}

module.exports = { createPlayer, checkBadges };