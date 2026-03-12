const { InlineKeyboard } = require("grammy");
const { q, q1, ins } = require("../database/helpers");
const { esc } = require("../utils/markdown");
const config = require("../config");
const log = require("../utils/logger");
const MODE_LABELS = require("../constants/gameModes");

async function showRoundPanel(ctx, gid, bot) {
  const g = await q1("SELECT * FROM games WHERE id=?", [gid]);
  const round = await q1(
    "SELECT * FROM rounds WHERE game_id=? AND round_number=? AND status='active'",
    [gid, g.current_round]
  );

  if (!round) {
    return ctx.reply("❌ Немає активного раунду\\.", { parse_mode: "MarkdownV2" });
  }

  const rps = await q(
    "SELECT rp.*, p.nickname FROM round_players rp JOIN players p ON rp.player_id=p.id WHERE rp.round_id=? ORDER BY rp.game_team, rp.is_alive DESC",
    [round.id]
  );

  let msg = `🔫 *Раунд ${g.current_round}/${g.total_rounds} — Гра \\#${gid}*\n\n`;

  const teams = {};
  rps.forEach((rp) => {
    const t = rp.game_team || "?";
    if (!teams[t]) teams[t] = [];
    teams[t].push(rp);
  });

  const teamLabels = g.game_mode === "ffa" ? {} : { A: "🔵 Team A", B: "🔴 Team B" };

  for (const [team, players] of Object.entries(teams)) {
    const alive = players.filter((p) => p.is_alive).length;
    const label = teamLabels[team] || (g.game_mode === "ffa" ? "" : `Team ${team}`);
    if (label) msg += `*${esc(label)}* \\(${alive} alive\\)\n`;
    players.forEach((p) => {
      const icon = p.is_alive ? "💚" : "💀";
      const kills = p.kills > 0 ? ` \\[${p.kills}K\\]` : "";
      msg += `  ${icon} ${esc(p.nickname)}${kills}\n`;
    });
    msg += "\n";
  }

  // Admin kill buttons
  const kb = new InlineKeyboard();
  const alive = rps.filter((rp) => rp.is_alive);
  alive.forEach((rp) => {
    kb.text(`💀 ${rp.nickname}`, `akill_${rp.player_id}_r${round.id}`).row();
  });
  kb.text("⏭ Завершити раунд", "gend_round_" + gid).row();
  kb.text("🔄 Оновити", "ground_panel_" + gid).row();
  kb.text("🔙 Назад", "gmng_" + gid).row();

  // Self-report button to channel
  const selfKb = new InlineKeyboard().text(
    "💀 Мене вбили",
    "imdead_" + gid + "_r" + round.id
  );
  if (config.CHANNEL_ID && bot) {
    try {
      await bot.api.sendMessage(
        config.CHANNEL_ID,
        `🔫 Раунд ${g.current_round} йде\\! Якщо тебе вбили — натисни кнопку:`,
        { parse_mode: "MarkdownV2", reply_markup: selfKb }
      );
    } catch (e) {}
  }

  return ctx.reply(msg, { parse_mode: "MarkdownV2", reply_markup: kb });
}

async function registerKill(roundId, killedId, killerId, source) {
  const round = await q1("SELECT * FROM rounds WHERE id=?", [roundId]);

  await ins(
    "INSERT INTO round_kills (round_id,game_id,killed_player_id,killer_player_id,reported_by) VALUES (?,?,?,?,?)",
    [roundId, round.game_id, killedId, killerId, source]
  );
  await ins(
    "UPDATE round_players SET is_alive=0 WHERE round_id=? AND player_id=?",
    [roundId, killedId]
  );

  if (killerId) {
    await ins(
      "UPDATE round_players SET kills=kills+1 WHERE round_id=? AND player_id=?",
      [roundId, killerId]
    );
  }

  log.info("Kill registered", { roundId, killed: killedId, killer: killerId, source });
}

async function endCurrentRound(ctx, gid, bot) {
  const g = await q1("SELECT * FROM games WHERE id=?", [gid]);
  const round = await q1(
    "SELECT * FROM rounds WHERE game_id=? AND round_number=? AND status='active'",
    [gid, g.current_round]
  );

  if (!round) return;

  if (g.game_mode === "ffa") {
    const alive = await q(
      "SELECT rp.*, p.nickname FROM round_players rp JOIN players p ON rp.player_id=p.id WHERE rp.round_id=? AND rp.is_alive=1",
      [round.id]
    );
    const winner = alive.length === 1 ? String(alive[0].player_id) : null;
    await ins(
      "UPDATE rounds SET winner_game_team=?, status='finished', ended_at=NOW() WHERE id=?",
      [winner, round.id]
    );

    if (g.current_round < g.total_rounds) {
      return startNextRound(ctx, gid, g.current_round + 1, g.total_rounds, bot);
    }
    return null; // signal to finish game
  }

  // Team mode: ask who won
  const teamAlive = await q(
    "SELECT game_team, SUM(is_alive) as alive FROM round_players WHERE round_id=? GROUP BY game_team",
    [round.id]
  );

  const kb = new InlineKeyboard();
  teamAlive.forEach((t) => {
    const label =
      t.game_team === "A"
        ? "🔵 Team A"
        : t.game_team === "B"
          ? "🔴 Team B"
          : `Team ${t.game_team}`;
    kb.text(`${label} (${t.alive} alive)`, `rwinner_${t.game_team}_g${gid}`).row();
  });
  kb.text("🔙 Назад", "gmng_" + gid).row();

  return ctx.reply(`🏁 *Хто виграв раунд ${g.current_round}?*`, {
    parse_mode: "MarkdownV2",
    reply_markup: kb,
  });
}

async function startNextRound(ctx, gid, nextR, totalR, bot) {
  await ins("UPDATE games SET current_round=? WHERE id=?", [nextR, gid]);
  await ins(
    "INSERT INTO rounds (game_id,round_number,status,started_at) VALUES (?,?,'active',NOW())",
    [gid, nextR]
  );

  const newRound = await q1("SELECT id FROM rounds WHERE game_id=? AND round_number=?", [
    gid,
    nextR,
  ]);
  const aps = await q(
    "SELECT player_id,game_team FROM game_players WHERE game_id=? AND attendance='checked_in'",
    [gid]
  );

  for (const ap of aps) {
    await ins(
      "INSERT INTO round_players (round_id,player_id,game_team,is_alive,kills) VALUES (?,?,?,1,0)",
      [newRound.id, ap.player_id, ap.game_team]
    );
  }

  const ann = `🔫 *Раунд ${nextR}/${totalR}\\!* Гра \\#${gid}`;
  if (config.CHANNEL_ID && bot) {
    try {
      await bot.api.sendMessage(config.CHANNEL_ID, ann, { parse_mode: "MarkdownV2" });
    } catch (e) {}
  }

  return showRoundPanel(ctx, gid, bot);
}

module.exports = {
  showRoundPanel,
  registerKill,
  endCurrentRound,
  startNextRound,
};