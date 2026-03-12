const { InlineKeyboard } = require("grammy");
const { q, q1, ins } = require("../database/helpers");
const { esc } = require("../utils/markdown");
const config = require("../config");
const log = require("../utils/logger");
const { showRoundPanel, registerKill, endCurrentRound, startNextRound } = require("../services/roundLogic");
const { finishGame } = require("../services/gameLogic");

function register(bot) {
  // ---- Start game ----
  bot.callbackQuery(/^gstart_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gstart_", ""));
    const g = await q1("SELECT * FROM games WHERE id=?", [gid]);

    // Mark no-shows
    await ins("UPDATE game_players SET attendance='no_show' WHERE game_id=? AND attendance='registered'", [gid]);

    // Assign game_team based on mode
    if (g.game_mode === "team_vs_team") {
      const teamIds = await q("SELECT DISTINCT team_id FROM game_players WHERE game_id=? AND attendance='checked_in' AND team_id IS NOT NULL", [gid]);
      const teamMap = {};
      let letter = "A";
      teamIds.forEach((t) => { teamMap[t.team_id] = letter; letter = String.fromCharCode(letter.charCodeAt(0) + 1); });
      for (const [tid, ltr] of Object.entries(teamMap)) {
        await ins("UPDATE game_players SET game_team=? WHERE game_id=? AND team_id=? AND attendance='checked_in'", [ltr, gid, parseInt(tid)]);
      }
    }

    if (g.game_mode === "ffa") {
      const ps = await q("SELECT id, player_id FROM game_players WHERE game_id=? AND attendance='checked_in'", [gid]);
      for (const p of ps) {
        await ins("UPDATE game_players SET game_team=? WHERE id=?", [String(p.player_id), p.id]);
      }
    }

    // Start round 1
    await ins("UPDATE games SET status='active', current_round=1 WHERE id=?", [gid]);
    await ins("INSERT INTO rounds (game_id, round_number, status, started_at) VALUES (?,1,'active',NOW())", [gid]);

    const round = await q1("SELECT id FROM rounds WHERE game_id=? AND round_number=1", [gid]);
    const activePlayers = await q("SELECT player_id, game_team FROM game_players WHERE game_id=? AND attendance='checked_in'", [gid]);
    for (const ap of activePlayers) {
      await ins("INSERT INTO round_players (round_id, player_id, game_team, is_alive, kills) VALUES (?,?,?,1,0)", [round.id, ap.player_id, ap.game_team]);
    }

    log.info("Game started", { gid, players: activePlayers.length });

    const noShows = await q1("SELECT COUNT(*) as c FROM game_players WHERE game_id=? AND attendance='no_show'", [gid]);

    await ctx.answerCallbackQuery({ text: "✅ Почалась!" });

    const ann = `🔴 *ГРА \\#${gid} ПОЧАЛАСЬ\\!*\n\n🔫 Раунд 1/${g.total_rounds}\n👥 Гравців: ${activePlayers.length}\n${noShows.c > 0 ? `⚠️ Не прийшли: ${noShows.c}\n` : ""}`;
    if (config.CHANNEL_ID) {
      try { await bot.api.sendMessage(config.CHANNEL_ID, ann, { parse_mode: "MarkdownV2" }); } catch (e) {}
    }

    return showRoundPanel(ctx, gid, bot);
  });

  // ---- Round panel ----
  bot.callbackQuery(/^ground_panel_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("ground_panel_", ""));
    await ctx.answerCallbackQuery();
    return showRoundPanel(ctx, gid, bot);
  });

  // ---- Admin kill ----
  bot.callbackQuery(/^akill_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const parts = ctx.callbackQuery.data.replace("akill_", "").split("_r");
    const pid = parseInt(parts[0]);
    const rid = parseInt(parts[1]);
    await registerKill(rid, pid, null, "admin");
    await ctx.answerCallbackQuery({ text: "💀 Вбито!" });
    const round = await q1("SELECT game_id FROM rounds WHERE id=?", [rid]);
    return showRoundPanel(ctx, round.game_id, bot);
  });

  // ---- Self-report dead ----
  bot.callbackQuery(/^imdead_/, async (ctx) => {
    const parts = ctx.callbackQuery.data.replace("imdead_", "").split("_r");
    const gid = parseInt(parts[0]);
    const rid = parseInt(parts[1]);
    const p = await q1("SELECT id FROM players WHERE telegram_id=?", [ctx.from.id]);
    if (!p) return ctx.answerCallbackQuery({ text: "❌", show_alert: true });

    const rp = await q1("SELECT is_alive FROM round_players WHERE round_id=? AND player_id=?", [rid, p.id]);
    if (!rp || !rp.is_alive) return ctx.answerCallbackQuery({ text: "💀 Вже вибув", show_alert: true });

    await registerKill(rid, p.id, null, "self");
    return ctx.answerCallbackQuery({ text: "💀 Відмічено" });
  });

  // ---- End round ----
  bot.callbackQuery(/^gend_round_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gend_round_", ""));
    const result = await endCurrentRound(ctx, gid, bot);

    // If FFA returned null — game needs finishing
    if (result === null) {
      await finishGame(ctx, gid, bot);
    }

    return ctx.answerCallbackQuery({ text: "✅ Раунд завершено!" });
  });

  // ---- Round winner (team mode) ----
  bot.callbackQuery(/^rwinner_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const parts = ctx.callbackQuery.data.replace("rwinner_", "").split("_g");
    const winTeam = parts[0];
    const gid = parseInt(parts[1]);
    const g = await q1("SELECT * FROM games WHERE id=?", [gid]);
    const round = await q1("SELECT * FROM rounds WHERE game_id=? AND round_number=?", [gid, g.current_round]);

    await ins("UPDATE rounds SET winner_game_team=?, status='finished', ended_at=NOW() WHERE id=?", [winTeam, round.id]);
    log.info("Round finished", { gid, round: g.current_round, winner: winTeam });

    if (g.current_round < g.total_rounds) {
      await startNextRound(ctx, gid, g.current_round + 1, g.total_rounds, bot);
    } else {
      await finishGame(ctx, gid, bot);
    }

    return ctx.answerCallbackQuery({ text: "✅" });
  });

  // ---- Finish game manually ----
  bot.callbackQuery(/^gfinish_/, async (ctx) => {
    if (!config.isAdmin(ctx)) return;
    const gid = parseInt(ctx.callbackQuery.data.replace("gfinish_", ""));
    const g = await q1("SELECT * FROM games WHERE id=?", [gid]);
    const curRound = await q1("SELECT * FROM rounds WHERE game_id=? AND round_number=? AND status='active'", [gid, g.current_round]);
    if (curRound) {
      await ins("UPDATE rounds SET status='finished', ended_at=NOW() WHERE id=?", [curRound.id]);
    }
    await finishGame(ctx, gid, bot);
    return ctx.answerCallbackQuery({ text: "🏁 Завершено!" });
  });
}

module.exports = { register };