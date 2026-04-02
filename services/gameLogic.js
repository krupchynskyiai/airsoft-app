const { InlineKeyboard } = require("grammy");
const { q, q1, ins } = require("../database/helpers");
const { esc } = require("../utils/markdown");
const { sendMenu } = require("../menus/main");
const config = require("../config");
const log = require("../utils/logger");
const MODE_LABELS = require("../constants/gameModes");
const { checkBadges } = require("./players");
const { updateSeasonStats } = require("./seasonStats");

async function createGame(ctx, bot) {
  const sd = ctx.session.data;
  const season = await q1("SELECT id FROM seasons WHERE is_active=1 LIMIT 1");

  const r = await ins(
    "INSERT INTO games (date,time,location,game_mode,total_rounds,status,season_id,checkin_lat,checkin_lng) VALUES (?,?,?,?,0,'upcoming',?,?,?)",
    [sd.date, sd.time, sd.location, sd.game_mode, season?.id || null, sd.lat, sd.lng]
  );

  const gid = r.insertId;
  log.info("Game created", { gid, mode: sd.game_mode, rounds: sd.total_rounds });

  const joinKb = new InlineKeyboard().text("📝 Записатись", "join_game_" + gid);
  const ann =
    `🔥 *ГРА \\#${gid}*\n\n` +
    `📅 ${esc(sd.date)} о ${esc(sd.time)}\n` +
    `📍 ${esc(sd.location)}\n` +
    `🎯 ${esc(MODE_LABELS[sd.game_mode])}\n\n` +
    `Натисни щоб записатись 👇`;

  if (config.CHANNEL_ID) {
    try {
      await bot.api.sendMessage(config.CHANNEL_ID, ann, {
        parse_mode: "MarkdownV2",
        reply_markup: joinKb,
      });
    } catch (e) {
      log.error("Channel", { e: e.message });
    }
  }

  await ctx.reply(ann, { parse_mode: "MarkdownV2", reply_markup: joinKb });

  ctx.session.step = null;
  ctx.session.data = {};
  return sendMenu(ctx, "✅ Гру створено\\!");
}

async function finishGame(ctx, gid, bot) {
  log.info("=== FINISHING GAME ===", { gid });

  await ins("UPDATE games SET status='finished' WHERE id=?", [gid]);

  const roundWins = await q(
    "SELECT winner_game_team, COUNT(*) as wins FROM rounds WHERE game_id=? AND winner_game_team IN ('A','B') AND status='finished' GROUP BY winner_game_team ORDER BY wins DESC",
    [gid]
  );
  const g = await q1("SELECT * FROM games WHERE id=?", [gid]);

  // Якщо по раундах рівність (нічия) — командного переможця нема
  let winnerTeam = null;
  if (roundWins.length) {
    const topWins = Math.max(...roundWins.map((r) => r.wins));
    const leaders = roundWins.filter((r) => r.wins === topWins);
    winnerTeam = leaders.length === 1 ? leaders[0].winner_game_team : null;
  }
  const outcomeOnly = !!g.score_round_outcomes_only;

  // Під час swap’ів `game_players.game_team` може змінюватись, тому win/lose визначаємо по `round_players.game_team`.
  const playerWinLose = await q(
    `SELECT
        rp.player_id,
        SUM(CASE
          WHEN r.status='finished'
           AND r.winner_game_team IN ('A','B')
           AND rp.game_team = r.winner_game_team
          THEN 1 ELSE 0
        END) AS win_rounds_all,
        SUM(CASE
          WHEN r.status='finished'
           AND r.winner_game_team IN ('A','B')
           AND rp.game_team <> r.winner_game_team
          THEN 1 ELSE 0
        END) AS lose_rounds_all
      FROM round_players rp
      JOIN rounds r ON r.id = rp.round_id
      WHERE r.game_id=? AND r.status='finished' AND r.winner_game_team IN ('A','B')
      GROUP BY rp.player_id`,
    [gid],
  );
  const winLoseMap = new Map(
    playerWinLose.map((r) => [
      r.player_id,
      {
        winRoundsAll: r.win_rounds_all || 0,
        loseRoundsAll: r.lose_rounds_all || 0,
      },
    ]),
  );

  const killStats = await q(
    "SELECT rk.killed_player_id, COUNT(*) as deaths FROM round_kills rk WHERE rk.game_id=? GROUP BY rk.killed_player_id",
    [gid]
  );
  const killerStats = await q(
    "SELECT rk.killer_player_id, COUNT(*) as kills FROM round_kills rk WHERE rk.game_id=? AND rk.killer_player_id IS NOT NULL GROUP BY rk.killer_player_id ORDER BY kills DESC",
    [gid]
  );

  const gps = await q(
    "SELECT * FROM game_players WHERE game_id=? AND attendance='checked_in'",
    [gid]
  );

  for (const gp of gps) {
    const st = winLoseMap.get(gp.player_id);
    const winRoundsAll = st?.winRoundsAll ?? 0;
    const loseRoundsAll = st?.loseRoundsAll ?? 0;
    const isWinner = winnerTeam !== null && winRoundsAll > loseRoundsAll;
    const playerKills = killerStats.find((k) => k.killer_player_id === gp.player_id)?.kills || 0;
    const rawDeaths = killStats.find((k) => k.killed_player_id === gp.player_id)?.deaths || 0;
    const playerDeaths = outcomeOnly ? 0 : rawDeaths;
    const addKills = outcomeOnly ? 0 : playerKills;
    const pts = outcomeOnly
      ? 5 + (isWinner ? 10 : 0)
      : 5 + (isWinner ? 10 : 0) + playerKills * 2;

    await ins(
      "UPDATE players SET games_played=games_played+1, wins=wins+?, total_kills=total_kills+?, total_deaths=total_deaths+?, rating=rating+? WHERE id=?",
      [isWinner ? 1 : 0, addKills, playerDeaths, pts, gp.player_id]
    );
    await ins(
      "UPDATE game_players SET kills_total=?, deaths_total=?, result=? WHERE game_id=? AND player_id=?",
      [addKills, playerDeaths, isWinner ? "win" : "loss", gid, gp.player_id]
    );

    const newStats = await q1("SELECT * FROM players WHERE id=?", [gp.player_id]);
    await checkBadges(gp.player_id, newStats, bot);

    if (g.season_id) {
      await updateSeasonStats(gp.player_id, g.season_id, isWinner, addKills, playerDeaths, pts);
    }
  }

  // No-shows penalty
  const noShows = await q(
    "SELECT player_id FROM game_players WHERE game_id=? AND attendance='no_show'",
    [gid]
  );
  for (const ns of noShows) {
    await ins("UPDATE players SET rating=GREATEST(0,rating-5) WHERE id=?", [ns.player_id]);
  }

  // Build results message
  let msg =
    `🏁 *Результати гри \\#${gid}*\n` +
    `📅 ${esc(g.date)} ${esc(g.time || "")}\n` +
    `🎯 ${esc(MODE_LABELS[g.game_mode])}\n\n`;

  const rounds = await q("SELECT * FROM rounds WHERE game_id=? ORDER BY round_number", [gid]);
  msg += `*Раунди:*\n`;
  rounds.forEach((r) => {
    const w =
      r.winner_game_team === "A"
        ? "🟡A"
        : r.winner_game_team === "B"
          ? "🔵B"
          : r.status === "finished"
            ? "⚖ нічия"
            : "—";
    msg += `  R${r.round_number}: ${w}\n`;
  });

  if (roundWins.length) {
    if (winnerTeam) {
      msg += `\n🏆 *Переможець: ${winnerTeam === "A" ? "🟡 Team A" : "🔵 Team B"}*\n`;
    } else {
      msg += `\n⚖️ *Нічия за раундами*\n`;
    }
    msg += `📊 Рахунок: ${roundWins.map((r) => `${r.winner_game_team}\\=${r.wins}`).join(" / ")}\n`;
  }

  if (killerStats.length) {
    msg += `\n🔫 *Top Killers:*\n`;
    for (const k of killerStats.slice(0, 3)) {
      const p = await q1("SELECT nickname FROM players WHERE id=?", [k.killer_player_id]);
      msg += `  ${esc(p?.nickname || "?")} — ${k.kills} kills\n`;
    }
  }

  if (noShows.length) {
    msg += `\n⚠️ Не прийшли: ${noShows.length} \\(\\-5pts\\)\n`;
  }

  if (config.CHANNEL_ID) {
    try {
      await bot.api.sendMessage(config.CHANNEL_ID, msg, { parse_mode: "MarkdownV2" });
    } catch (e) {
      log.error("Channel", { e: e.message });
    }
  }
  await ctx.reply(msg, { parse_mode: "MarkdownV2" });

  // MVP voting
  const mvpKb = new InlineKeyboard();
  const topKillers = await q(
    "SELECT DISTINCT rk.killer_player_id, p.nickname, COUNT(*) as k FROM round_kills rk JOIN players p ON rk.killer_player_id=p.id WHERE rk.game_id=? AND rk.killer_player_id IS NOT NULL GROUP BY rk.killer_player_id, p.nickname ORDER BY k DESC LIMIT 8",
    [gid]
  );

  if (topKillers.length >= 2) {
    topKillers.forEach((p) =>
      mvpKb.text(`⭐ ${p.nickname} (${p.k}K)`, `vote_mvp_${p.killer_player_id}_g${gid}`).row()
    );
    const mvpMsg = `🗳 *Голосування MVP — Гра \\#${gid}*`;
    if (config.CHANNEL_ID) {
      try {
        await bot.api.sendMessage(config.CHANNEL_ID, mvpMsg, {
          parse_mode: "MarkdownV2",
          reply_markup: mvpKb,
        });
      } catch (e) {}
    }
    await ctx.reply(mvpMsg, { parse_mode: "MarkdownV2", reply_markup: mvpKb });
  }

  log.info("=== GAME FINISHED ===", { gid });
  return sendMenu(ctx, "Обери дію:");
}

module.exports = { createGame, finishGame };