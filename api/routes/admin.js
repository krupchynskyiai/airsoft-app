const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const { getDB } = require("../../database/connection");
const { adminMiddleware } = require("../middleware/auth");
const log = require("../../utils/logger");
const config = require("../../config");
const bot = require("../bot");
const { LOOT_REWARDS } = require("../../constants/lootRewards");
const { EQUIPMENT_CATALOG, EQUIPMENT_BY_KEY } = require("../../constants/equipmentCatalog");

const router = Router();
router.use(adminMiddleware);

function normalizeWinnerTeam(winnerTeamRaw) {
  let winnerTeam = winnerTeamRaw;
  if (winnerTeam === "" || winnerTeam === undefined) winnerTeam = null;
  if (["draw", "X", "tie", "нічия"].includes(winnerTeam)) winnerTeam = null;
  if (winnerTeam !== null && !["A", "B"].includes(winnerTeam)) return { valid: false };
  return { valid: true, value: winnerTeam };
}

router.post("/games", async (req, res) => {
  try {
    const {
      date,
      time,
      location,
      game_mode,
      max_players,
      payment,
      duration,
      checkin_lat,
      checkin_lng,
      score_round_outcomes_only,
    } = req.body;

    const season = await q1("SELECT id FROM seasons WHERE is_active=1 LIMIT 1");

    const r = await ins(
      "INSERT INTO games (date,time,location,game_mode,max_players,payment,duration,score_round_outcomes_only,total_rounds,status,season_id,checkin_lat,checkin_lng) VALUES (?,?,?,?,?,?,?,?,0,'upcoming',?,?,?)",
      [
        date,
        time,
        location,
        game_mode || "team_vs_team",
        max_players || null,
        payment || 0,
        duration || null,
        score_round_outcomes_only ? 1 : 0,
        season?.id || null,
        checkin_lat || null,
        checkin_lng || null,
      ],
    );

    const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${r.insertId}`;

    log.info("API create game", { id: r.insertId });

    // ---------------------------
    // TELEGRAM MESSAGE
    // ---------------------------

    if (config.CHANNEL_ID) {
      try {
        const modeLabel =
          {
            team_vs_team: "Команда проти команди",
            random_teams: "Випадкові команди",
            ffa: "Free For All",
          }[game_mode] || game_mode;

        const msg = `🔫 <b>Нова гра!</b>
  
📅 Дата: ${date}
⏰ Час: ${time || "—"}
📍 Локація: ${location}
⏱ Тривалість: <b>${duration || "—"}</b>
  
👥 Місць: ${max_players || "∞"}
🪙 Вартість участі: <b>${payment || 0} грн</b>
  
🎮 Режим: ${modeLabel}`;

        await bot.api.sendMessage(config.CHANNEL_ID, msg, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "🔥 Записатися",
                  url: deepLink,
                },
              ],
            ],
          },
        });
      } catch (e) {
        log.error("Channel send error", { e: e.message });
      }
    }

    res.json({ success: true, game_id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/status
router.post("/games/:id/status", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { status } = req.body;

    const g = await q1("SELECT * FROM games WHERE id=?", [gid]);

    await ins("UPDATE games SET status=? WHERE id=?", [status, gid]);

    let finishSummary = null;

    // Finish game
    if (status === "finished") {
      const activeRound = await q1(
        "SELECT id FROM rounds WHERE game_id=? AND status='active'",
        [gid],
      );

      if (activeRound) {
        await ins(
          "UPDATE rounds SET status='finished', ended_at=NOW() WHERE id=?",
          [activeRound.id],
        );
      }

      await ins("UPDATE games SET total_rounds=? WHERE id=?", [
        g.current_round,
        gid,
      ]);

      await calculateGameScores(gid);
      finishSummary = await getGameFinishWinnerSummary(gid, g.game_mode);
    }

    // Start game
    if (status === "active") {
      await ins(
        "UPDATE game_players SET attendance='no_show' WHERE game_id=? AND attendance IN ('registered','checkin_pending')",
        [gid],
      );

      if (g.game_mode === "team_vs_team") {
        const teamIds = await q(
          "SELECT DISTINCT team_id FROM game_players WHERE game_id=? AND attendance='checked_in' AND team_id IS NOT NULL",
          [gid],
        );

        let letter = "A";

        for (const t of teamIds) {
          await ins(
            "UPDATE game_players SET game_team=? WHERE game_id=? AND team_id=? AND attendance='checked_in'",
            [letter, gid, t.team_id],
          );

          letter = String.fromCharCode(letter.charCodeAt(0) + 1);
        }
      }

      if (g.game_mode === "random_teams") {
        const ps = await q(
          `SELECT gp.id, p.rating
           FROM game_players gp
           JOIN players p ON p.id = gp.player_id
           WHERE gp.game_id=? AND gp.attendance='checked_in'`,
          [gid],
        );

        // AUTO TEAM BALANCER — balance by rating
        const sorted = ps
          .map((row) => ({
            id: row.id,
            rating: typeof row.rating === "number" ? row.rating : 0,
          }))
          .sort((a, b) => b.rating - a.rating);

        let totalA = 0;
        let totalB = 0;
        const teamA = [];
        const teamB = [];

        for (const p of sorted) {
          if (totalA <= totalB) {
            teamA.push(p.id);
            totalA += p.rating;
          } else {
            teamB.push(p.id);
            totalB += p.rating;
          }
        }

        for (const id of teamA) {
          await ins("UPDATE game_players SET game_team='A' WHERE id=?", [id]);
        }
        for (const id of teamB) {
          await ins("UPDATE game_players SET game_team='B' WHERE id=?", [id]);
        }

        log.info("Random teams balanced", {
          gid,
          totalA,
          totalB,
          countA: teamA.length,
          countB: teamB.length,
        });
      }

      if (g.game_mode === "ffa") {
        const ps = await q(
          "SELECT id, player_id FROM game_players WHERE game_id=? AND attendance='checked_in'",
          [gid],
        );

        for (const p of ps) {
          await ins("UPDATE game_players SET game_team=? WHERE id=?", [
            String(p.player_id),
            p.id,
          ]);
        }
      }

      await ins("UPDATE games SET current_round=0 WHERE id=?", [gid]);
    }

    // TELEGRAM NOTIFICATION
    if (config.CHANNEL_ID) {
      try {
        const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;

        const labels = {
          checkin: "📍 <b>Відкрито Check-in</b>",
          active: "▶️ <b>Гру розпочато</b>",
          finished: "🏁 <b>Гру завершено</b>",
          cancelled: "❌ <b>Гру скасовано</b>",
        };

        const info = `📅 Дата: ${g.date}
⏰ Час: ${g.time || "—"}
📍 Локація: ${g.location}
⏱ Тривалість: <b>${g.duration || "—"}</b>
🪙 Вартість участі: <b>${g.payment || 0} грн</b>`;

        const statusHead =
          status === "finished" && finishSummary
            ? `🏁 <b>Гру завершено</b>\n\n${finishSummary.winner_message_html}`
            : labels[status] || "ℹ️ Статус гри змінено";

        const msg = `${statusHead}

🎮 Гра #${gid}

${info}`;

        await bot.api.sendMessage(config.CHANNEL_ID, msg, {
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "📋 Переглянути гру", url: deepLink }]],
          },
        });
      } catch (e) {
        log.error("Channel status notify error", { e: e.message });
      }
    }

    const payload = { success: true };
    if (finishSummary) {
      payload.winner_game_team = finishSummary.winner_game_team;
      payload.winner_message = finishSummary.winner_message;
      payload.round_record_line = finishSummary.round_record_line;
    }
    res.json(payload);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/start-round
router.post("/games/:id/start-round", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);

    const game = await q1("SELECT * FROM games WHERE id=?", [gid]);

    if (!game || game.status !== "active")
      return res.status(400).json({ error: "Game not active" });

    const activeRound = await q1(
      "SELECT id FROM rounds WHERE game_id=? AND status='active'",
      [gid],
    );

    if (activeRound)
      return res.status(400).json({ error: "Round already active" });

    const nextR = game.current_round + 1;

    await ins("UPDATE games SET current_round=? WHERE id=?", [nextR, gid]);

    await ins(
      "INSERT INTO rounds (game_id,round_number,status,started_at) VALUES (?,?,'active',NOW())",
      [gid, nextR],
    );

    const newRound = await q1(
      "SELECT id FROM rounds WHERE game_id=? AND round_number=?",
      [gid, nextR],
    );

    const aps = await q(
      "SELECT player_id,game_team FROM game_players WHERE game_id=? AND attendance='checked_in'",
      [gid],
    );

    for (const ap of aps) {
      await ins(
        "INSERT INTO round_players (round_id,player_id,game_team,is_alive,kills) VALUES (?,?,?,1,0)",
        [newRound.id, ap.player_id, ap.game_team],
      );
    }

    // TELEGRAM
    if (config.CHANNEL_ID) {
      try {
        const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;

        const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: <b>${game.duration || "—"}</b>
🪙 Вартість участі: <b>${game.payment || 0} грн</b>`;

        await bot.api.sendMessage(
          config.CHANNEL_ID,
          `🔥 <b>Почався раунд!</b>

🎮 Гра #${gid}
🔄 Раунд: <b>${nextR}</b>

${info}`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "📊 Дивитися гру", url: deepLink }]],
            },
          },
        );
      } catch (e) {
        log.error("Round start notify error", { e: e.message });
      }
    }

    log.info("Round started", { gid, round: nextR });

    res.json({ success: true, round: nextR });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/end-round
router.post("/games/:id/end-round", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    let { winner_team } = req.body;

    if (winner_team === "" || winner_team === undefined) winner_team = null;
    if (["draw", "X", "tie", "нічия"].includes(winner_team)) winner_team = null;
    if (winner_team !== null && !["A", "B"].includes(winner_team)) {
      return res.status(400).json({
        error: "winner_team must be A, B, or null (draw)",
      });
    }

    const game = await q1("SELECT * FROM games WHERE id=?", [gid]);

    const round = await q1(
      "SELECT id FROM rounds WHERE game_id=? AND round_number=? AND status='active'",
      [gid, game.current_round],
    );

    if (!round) return res.status(400).json({ error: "No active round" });

    await ins(
      "UPDATE rounds SET winner_game_team=?, status='finished', ended_at=NOW() WHERE id=?",
      [winner_team, round.id],
    );

    await ins("UPDATE games SET total_rounds=? WHERE id=?", [
      game.current_round,
      gid,
    ]);

    // TELEGRAM
    if (config.CHANNEL_ID) {
      try {
        const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;

        const winner =
          winner_team === "A"
            ? "🟡 Команда A"
            : winner_team === "B"
              ? "🔵 Команда B"
              : "⚖ Нічия";

        const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: <b>${game.duration || "—"}</b>
🪙 Вартість участі: <b>${game.payment || 0} грн</b>`;

        await bot.api.sendMessage(
          config.CHANNEL_ID,
          `🏁 <b>Раунд завершено</b>

🎮 Гра #${gid}
🔄 Раунд: ${game.current_round}

🏆 Переможець: <b>${winner}</b>

${info}`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "📊 Дивитися гру", url: deepLink }]],
            },
          },
        );
      } catch (e) {
        log.error("Round end notify error", { e: e.message });
      }
    }

    log.info("Round ended", {
      gid,
      round: game.current_round,
      winner: winner_team,
    });

    res.json({ success: true, roundFinished: game.current_round });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/end-round-batch
// Applies selected kills + round winner atomically in one request.
router.post("/games/:id/end-round-batch", async (req, res) => {
  const gid = parseInt(req.params.id, 10);
  const body = req.body || {};
  const normalized = normalizeWinnerTeam(body.winner_team);

  if (!normalized.valid) {
    return res.status(400).json({
      error: "winner_team must be A, B, or null (draw)",
    });
  }

  let killedPlayerIds = Array.isArray(body.killed_player_ids)
    ? body.killed_player_ids
    : [];
  killedPlayerIds = [...new Set(
    killedPlayerIds
      .map((x) => Number(x))
      .filter((x) => Number.isInteger(x) && x > 0),
  )];

  const conn = await getDB().getConnection();
  let game = null;
  let appliedKills = [];

  try {
    await conn.beginTransaction();

    const [gameRows] = await conn.execute("SELECT * FROM games WHERE id=? FOR UPDATE", [gid]);
    game = gameRows[0];
    if (!game) {
      await conn.rollback();
      return res.status(404).json({ error: "Game not found" });
    }

    const [roundRows] = await conn.execute(
      "SELECT id FROM rounds WHERE game_id=? AND round_number=? AND status='active' FOR UPDATE",
      [gid, game.current_round],
    );
    const round = roundRows[0];
    if (!round) {
      await conn.rollback();
      return res.status(400).json({ error: "No active round" });
    }

    if (killedPlayerIds.length > 0) {
      const placeholders = killedPlayerIds.map(() => "?").join(",");
      const [aliveRows] = await conn.execute(
        `SELECT player_id
         FROM round_players
         WHERE round_id=? AND is_alive=1 AND player_id IN (${placeholders})`,
        [round.id, ...killedPlayerIds],
      );
      appliedKills = aliveRows.map((r) => r.player_id);

      if (appliedKills.length > 0) {
        for (const playerId of appliedKills) {
          await conn.execute(
            "INSERT INTO round_kills (round_id,game_id,killed_player_id,reported_by) VALUES (?,?,?,'admin')",
            [round.id, gid, playerId],
          );
        }

        const killPlaceholders = appliedKills.map(() => "?").join(",");
        await conn.execute(
          `UPDATE round_players
           SET is_alive=0
           WHERE round_id=? AND player_id IN (${killPlaceholders})`,
          [round.id, ...appliedKills],
        );
      }
    }

    await conn.execute(
      "UPDATE rounds SET winner_game_team=?, status='finished', ended_at=NOW() WHERE id=?",
      [normalized.value, round.id],
    );

    await conn.execute("UPDATE games SET total_rounds=? WHERE id=?", [
      game.current_round,
      gid,
    ]);

    await conn.commit();

    if (config.CHANNEL_ID) {
      try {
        const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;
        const winner =
          normalized.value === "A"
            ? "🟡 Команда A"
            : normalized.value === "B"
              ? "🔵 Команда B"
              : "⚖ Нічия";

        const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: <b>${game.duration || "—"}</b>
🪙 Вартість участі: <b>${game.payment || 0} грн</b>`;

        await bot.api.sendMessage(
          config.CHANNEL_ID,
          `🏁 <b>Раунд завершено</b>

🎮 Гра #${gid}
🔄 Раунд: ${game.current_round}

🏆 Переможець: <b>${winner}</b>

${info}`,
          {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "📊 Дивитися гру", url: deepLink }]],
            },
          },
        );
      } catch (e) {
        log.error("Round end notify error", { e: e.message });
      }
    }

    log.info("Round ended by batch endpoint", {
      gid,
      round: game.current_round,
      winner: normalized.value,
      killsApplied: appliedKills.length,
    });

    res.json({
      success: true,
      roundFinished: game.current_round,
      killsApplied: appliedKills.length,
      ignoredKills: killedPlayerIds.length - appliedKills.length,
    });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

// POST /api/admin/games/:id/kill
router.post("/games/:id/kill", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { player_id } = req.body;

    const game = await q1("SELECT current_round FROM games WHERE id=?", [gid]);
    const round = await q1(
      "SELECT id FROM rounds WHERE game_id=? AND round_number=? AND status='active'",
      [gid, game.current_round],
    );
    if (!round) return res.status(400).json({ error: "No active round" });

    await ins(
      "INSERT INTO round_kills (round_id,game_id,killed_player_id,reported_by) VALUES (?,?,?,'admin')",
      [round.id, gid, player_id],
    );
    await ins(
      "UPDATE round_players SET is_alive=0 WHERE round_id=? AND player_id=?",
      [round.id, player_id],
    );

    log.info("API kill", { gid, killed: player_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/move-player — manually switch player between teams (A/B)
router.post("/games/:id/move-player", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { player_id, target_team } = req.body;

    if (!player_id || !["A", "B"].includes(target_team)) {
      return res.status(400).json({ error: "player_id and target_team A|B required" });
    }

    const game = await q1("SELECT id, game_mode FROM games WHERE id=?", [gid]);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    if (game.game_mode === "ffa") {
      return res.status(400).json({ error: "Manual team switch is not available for FFA mode" });
    }

    const gp = await q1(
      "SELECT id, attendance, game_team FROM game_players WHERE game_id=? AND player_id=?",
      [gid, player_id],
    );

    if (!gp) {
      return res.status(404).json({ error: "Player not in this game" });
    }

    // Only meaningful after check-in; require checked_in
    if (gp.attendance !== "checked_in") {
      return res.status(400).json({ error: "Player must be checked-in to move between teams" });
    }

    if (gp.game_team === target_team) {
      return res.json({ success: true, game_team: gp.game_team });
    }

    await ins(
      "UPDATE game_players SET game_team=? WHERE id=?",
      [target_team, gp.id],
    );

    // If there is an active round, also move in round_players so live board stays consistent
    const activeRound = await q1(
      "SELECT id FROM rounds WHERE game_id=? AND status='active' ORDER BY round_number DESC LIMIT 1",
      [gid],
    );

    if (activeRound) {
      await ins(
        "UPDATE round_players SET game_team=? WHERE round_id=? AND player_id=?",
        [target_team, activeRound.id, player_id],
      );
    }

    log.info("Admin moved player between teams", {
      gid,
      playerId: player_id,
      from: gp.game_team,
      to: target_team,
      activeRoundId: activeRound?.id || null,
    });

    res.json({ success: true, game_team: target_team });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/shuffle-teams — random shuffle checked-in players between A/B
router.post("/games/:id/shuffle-teams", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);

    const game = await q1("SELECT id, status, game_mode FROM games WHERE id=?", [gid]);
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    if (game.game_mode === "ffa") {
      return res.status(400).json({ error: "Shuffle is not available for FFA mode" });
    }

    // Allowed only between rounds (active game, no active round)
    if (game.status !== "active") {
      return res.status(400).json({ error: "Shuffle is available only during active game" });
    }

    const activeRound = await q1(
      "SELECT id FROM rounds WHERE game_id=? AND status='active' ORDER BY round_number DESC LIMIT 1",
      [gid],
    );
    if (activeRound) {
      return res.status(400).json({ error: "Cannot shuffle teams during active round" });
    }

    const players = await q(
      "SELECT id, player_id FROM game_players WHERE game_id=? AND attendance='checked_in'",
      [gid],
    );
    if (players.length < 2) {
      return res.status(400).json({ error: "Not enough checked-in players to shuffle teams" });
    }

    // Fisher-Yates
    const shuffled = [...players];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const split = Math.ceil(shuffled.length / 2);
    const teamA = shuffled.slice(0, split);
    const teamB = shuffled.slice(split);

    for (const p of teamA) {
      await ins("UPDATE game_players SET game_team='A' WHERE id=?", [p.id]);
    }
    for (const p of teamB) {
      await ins("UPDATE game_players SET game_team='B' WHERE id=?", [p.id]);
    }

    log.info("Admin shuffled teams", {
      gid,
      count: shuffled.length,
      teamA: teamA.length,
      teamB: teamB.length,
    });

    res.json({
      success: true,
      teamA: teamA.length,
      teamB: teamB.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/mvp-select — admin picks Round MVP (latest finished round or any finished round)
router.post("/games/:id/mvp-select", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { round_id, target_player_id } = req.body;

    if (!round_id || !target_player_id) {
      return res.status(400).json({ error: "round_id and target_player_id required" });
    }

    const game = await q1("SELECT id, status, game_mode FROM games WHERE id=?", [gid]);
    if (!game) return res.status(404).json({ error: "Game not found" });

    // MVP selection is only meaningful after a round is finished
    const round = await q1(
      "SELECT id, round_number, winner_game_team, status FROM rounds WHERE id=? AND game_id=?",
      [round_id, gid],
    );
    if (!round || round.status !== "finished" || !round.winner_game_team) {
      return res.status(400).json({ error: "Round not eligible for MVP selection" });
    }

    // target must be from winning team in that round
    const targetInRound = await q1(
      "SELECT id FROM round_players WHERE round_id=? AND player_id=? AND game_team=?",
      [round_id, target_player_id, round.winner_game_team],
    );
    if (!targetInRound) {
      return res.status(400).json({ error: "Invalid MVP target (must be from winning team)" });
    }

    // Use admin's player_id as voter_player_id (so mvp-state can find "my vote")
    const adminPlayer = await q1(
      "SELECT id FROM players WHERE telegram_id=?",
      [req.tgUser?.id],
    );
    if (!adminPlayer) {
      return res.status(400).json({ error: "Admin player not found (register first)" });
    }

    // Make admin selection the single source of truth for the round.
    await ins("DELETE FROM round_mvp_votes WHERE round_id=?", [round_id]);

    await ins(
      "INSERT INTO round_mvp_votes (round_id,game_id,voter_player_id,target_player_id,created_at) VALUES (?,?,?,?,NOW())",
      [round_id, gid, adminPlayer.id, target_player_id],
    );

    log.info("Admin selected MVP", { gid, round_id, target_player_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/add-by-username — add players by Telegram @username (even if never opened app)
router.post("/games/:id/add-by-username", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { usernames } = req.body; // array of strings

    if (!Array.isArray(usernames) || usernames.length === 0) {
      return res.status(400).json({ error: "usernames[] required" });
    }

    const game = await q1("SELECT id, status FROM games WHERE id=?", [gid]);
    if (!game) return res.status(404).json({ error: "Game not found" });
    if (["finished", "cancelled"].includes(game.status)) {
      return res.status(400).json({ error: "Cannot add players for this game status" });
    }

    const normalized = Array.from(
      new Set(
        usernames
          .map((u) => String(u || "").trim())
          .filter(Boolean)
          .map((u) => u.replace(/^https?:\/\/t\.me\//i, ""))
          .map((u) => u.replace(/^t\.me\//i, ""))
          .map((u) => u.replace(/^@/, ""))
          .map((u) => u.split("?")[0])
          .map((u) => u.split("/")[0])
          .map((u) => u.trim()),
      ),
    ).filter((u) => u.length >= 3);

    const added = [];
    const skipped = [];

    for (const uname of normalized) {
      let player = null;

      // Prefer telegram_username lookup (requires schema support)
      try {
        player = await q1(
          "SELECT id, telegram_id FROM players WHERE telegram_username=? LIMIT 1",
          [uname],
        );
      } catch (e) {
        return res.status(400).json({
          error:
            "DB schema missing telegram_username/nullable telegram_id. Run the SQL migration from the instructions.",
        });
      }

      if (!player) {
        // Prevent conflicts: don't create placeholder if nickname is already taken by someone else
        const nick = `@${uname}`;
        const nickTaken = await q1(
          "SELECT id, telegram_id, telegram_username FROM players WHERE nickname IN (?,?) LIMIT 1",
          [uname, nick],
        );
        if (nickTaken) {
          skipped.push({
            username: uname,
            reason: "nickname_conflict",
            conflict_player_id: nickTaken.id,
          });
          continue;
        }

        // create placeholder (telegram_id NULL)
        const r = await ins(
          "INSERT INTO players (telegram_id,telegram_username,nickname,rating,games_played,wins,mvp_count,total_kills,total_deaths) VALUES (NULL,?,?,0,0,0,0,0,0)",
          [uname, nick],
        );
        player = { id: r.insertId, telegram_id: null };
      }

      const existsInGame = await q1(
        "SELECT id FROM game_players WHERE game_id=? AND player_id=?",
        [gid, player.id],
      );
      if (existsInGame) {
        skipped.push({ username: uname, reason: "already_in_game" });
        continue;
      }

      await ins(
        "INSERT INTO game_players (game_id, player_id, team_id) VALUES (?,?,NULL)",
        [gid, player.id],
      );
      added.push({ username: uname, player_id: player.id });
    }

    log.info("Admin add-by-username", { gid, added: added.length, skipped: skipped.length });
    res.json({ success: true, added, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/kick-player — remove registered player from game
router.post("/games/:id/kick-player", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { player_id } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: "player_id required" });
    }

    const game = await q1(
      "SELECT id, date, time, location, status, max_players, payment, duration FROM games WHERE id=?",
      [gid],
    );
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    if (["finished", "cancelled"].includes(game.status)) {
      return res
        .status(400)
        .json({ error: "Cannot kick players for this game status" });
    }

    const registration = await q1(
      "SELECT id, attendance FROM game_players WHERE game_id=? AND player_id=?",
      [gid, player_id],
    );
    if (!registration) {
      return res
        .status(404)
        .json({ error: "Player not registered for this game" });
    }

    const beforeCnt = await q1(
      "SELECT COUNT(*) as c FROM game_players WHERE game_id=?",
      [gid],
    );

    await ins("DELETE FROM game_players WHERE id=?", [registration.id]);

    let newCount = beforeCnt.c - 1;

    // Try to promote first player from waitlist (best-effort)
    try {
      const waitCandidate = await q1(
        `SELECT w.player_id, p.team_id, p.telegram_id, p.nickname
         FROM game_waitlist w
         JOIN players p ON p.id = w.player_id
         LEFT JOIN player_blacklist b ON b.player_id = w.player_id AND b.active=1
         WHERE w.game_id=? AND b.player_id IS NULL
         ORDER BY w.created_at ASC
         LIMIT 1`,
        [gid],
      );

      if (waitCandidate) {
        await ins(
          "INSERT INTO game_players (game_id, player_id, team_id) VALUES (?,?,?)",
          [gid, waitCandidate.player_id, waitCandidate.team_id],
        );
        await ins(
          "DELETE FROM game_waitlist WHERE game_id=? AND player_id=?",
          [gid, waitCandidate.player_id],
        );
        newCount += 1;

        // Notify player that they were moved from waitlist into the game
        try {
          if (waitCandidate.telegram_id) {
            const deepLink = config.BOT_USERNAME
              ? `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`
              : undefined;

            const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: ${game.duration || "—"}
🪙 Вартість участі: <b>${game.payment || 0} грн</b>`;

            await bot.api.sendMessage(
              waitCandidate.telegram_id,
              `✅ <b>Ти потрапив у гру з листа очікування</b>

🎮 Гра #${gid}

${info}`,
              {
                parse_mode: "HTML",
                reply_markup: deepLink
                  ? {
                      inline_keyboard: [
                        [{ text: "📋 Відкрити гру", url: deepLink }],
                      ],
                    }
                  : undefined,
              },
            );
          }
        } catch (e) {
          log.error("Admin waitlist promote notify error", { e: e.message });
        }
      }
    } catch (e) {
      // Якщо немає game_waitlist / player_blacklist — тихо ігноруємо
      log.error("Admin waitlist promote error (ignored)", { e: e.message });
    }

    const remaining =
      game.max_players != null ? game.max_players - newCount : null;

    log.info("Admin kicked game player", {
      gid,
      playerId: player_id,
      before: beforeCnt.c,
      after: newCount,
      remaining,
    });

    // Telegram notification about free slots (same logic as cancel)
    if (config.CHANNEL_ID && game.max_players) {
      try {
        const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;

        const remainingBefore = game.max_players - beforeCnt.c;
        const remainingAfter = game.max_players - newCount;

        const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: <b>${game.duration || "—"}</b>
🪙 Вартість участі: <b>${game.payment} грн</b>`;

        let msg;

        if (remainingBefore === 0 && remainingAfter > 0) {
          msg = `✅ <b>З'явилося вільне місце!</b>

🎮 Гра #${gid}
👥 Вільних місць: <b>${remainingAfter}</b>

${info}`;
        } else if (remainingAfter > 0) {
          msg = `ℹ️ <b>Оновлена кількість місць</b>

🎮 Гра #${gid}
👥 Вільних місць: <b>${remainingAfter}</b>

${info}`;
        }

        if (msg) {
          await bot.api.sendMessage(config.CHANNEL_ID, msg, {
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "🔥 Записатися",
                    url: deepLink,
                  },
                ],
              ],
            },
          });
        }
      } catch (e) {
        log.error("Admin kick notify error", { e: e.message });
      }
    }

    res.json({
      success: true,
      total: newCount,
      remaining,
      max_players: game.max_players,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/checkin-review
router.post("/games/:id/checkin-review", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { player_id, action } = req.body; // 'confirm' | 'reject'

    if (!player_id || !["confirm", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const game = await q1("SELECT id, status FROM games WHERE id=?", [gid]);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const reg = await q1(
      "SELECT attendance FROM game_players WHERE game_id=? AND player_id=?",
      [gid, player_id],
    );
    if (!reg) {
      return res.status(404).json({ error: "Player not registered for game" });
    }

    // Підтвердити чекін: з очікування АБО напряму з «записаний» (адмін без телефону гравця)
    if (action === "confirm") {
      if (!["checkin", "active"].includes(game.status)) {
        return res
          .status(400)
          .json({ error: "Check-in only during check-in or live game" });
      }
      if (!["registered", "checkin_pending"].includes(reg.attendance)) {
        return res.status(400).json({
          error: "Can only confirm players who are registered or pending check-in",
        });
      }
      await ins(
        "UPDATE game_players SET attendance='checked_in', checkin_time=COALESCE(checkin_time, NOW()) WHERE game_id=? AND player_id=?",
        [gid, player_id],
      );
    } else {
      if (reg.attendance !== "checkin_pending") {
        return res
          .status(400)
          .json({ error: "Can only reject pending geo check-in" });
      }
      await ins(
        "UPDATE game_players SET attendance='registered', checkin_time=NULL WHERE game_id=? AND player_id=?",
        [gid, player_id],
      );
    }

    log.info("Admin checkin review", { gid, player_id, action });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/teams
router.post("/teams", async (req, res) => {
  try {
    const { name } = req.body;
    const r = await ins(
      "INSERT INTO teams (name,captain_id,rating) VALUES (?,NULL,0)",
      [name],
    );
    res.json({ success: true, team_id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/points
router.post("/points", async (req, res) => {
  try {
    const { nickname, amount } = req.body;
    const p = await q1("SELECT id, rating FROM players WHERE nickname=?", [
      nickname,
    ]);
    if (!p) return res.status(404).json({ error: "Player not found" });
    const nr = Math.max(0, p.rating + amount);
    await ins("UPDATE players SET rating=? WHERE id=?", [nr, p.id]);
    res.json({ success: true, newRating: nr });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ------------------------------
// BLACKLIST MANAGEMENT
// ------------------------------

// POST /api/admin/blacklist/add
router.post("/blacklist/add", async (req, res) => {
  try {
    const { player_id, reason } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: "player_id required" });
    }

    const p = await q1("SELECT id FROM players WHERE id=?", [player_id]);
    if (!p) return res.status(404).json({ error: "Player not found" });

    const existing = await q1(
      "SELECT id FROM player_blacklist WHERE player_id=?",
      [player_id],
    );

    if (existing) {
      await ins(
        "UPDATE player_blacklist SET active=1, reason=?, updated_at=NOW() WHERE id=?",
        [reason || null, existing.id],
      );
    } else {
      await ins(
        "INSERT INTO player_blacklist (player_id, reason, active, created_at) VALUES (?,?,1,NOW())",
        [player_id, reason || null],
      );
    }

    log.info("Blacklist add", { player_id, reason });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/blacklist/remove
router.post("/blacklist/remove", async (req, res) => {
  try {
    const { player_id } = req.body;

    if (!player_id) {
      return res.status(400).json({ error: "player_id required" });
    }

    await ins(
      "UPDATE player_blacklist SET active=0, updated_at=NOW() WHERE player_id=?",
      [player_id],
    );

    log.info("Blacklist remove", { player_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/survey/responses — list survey answers (admin only)
router.get("/survey/responses", async (req, res) => {
  try {
    const limitRaw = Number(req.query.limit);
    const offsetRaw = Number(req.query.offset);
    const limit = Number.isInteger(limitRaw)
      ? Math.min(Math.max(limitRaw, 1), 200)
      : 100;
    const offset = Number.isInteger(offsetRaw)
      ? Math.max(offsetRaw, 0)
      : 0;

    const rows = await q(
      `SELECT
          s.id,
          s.survey_key,
          s.overall_experience,
          s.likes_json,
          s.pain_points,
          s.improvements_json,
          s.app_helpfulness,
          s.missing_feature,
          s.created_at,
          s.updated_at,
          p.id AS player_id,
          COALESCE(p.callsign, p.nickname) AS player_name,
          p.telegram_username
       FROM player_feedback_surveys s
       JOIN players p ON p.id = s.player_id
       ORDER BY s.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    const items = rows.map((r) => {
      let likes = [];
      let improvements = [];
      try {
        likes = JSON.parse(r.likes_json || "[]");
      } catch {}
      try {
        improvements = JSON.parse(r.improvements_json || "[]");
      } catch {}
      return {
        id: r.id,
        survey_key: r.survey_key,
        player_id: r.player_id,
        player_name: r.player_name,
        telegram_username: r.telegram_username,
        overall_experience: r.overall_experience,
        likes,
        pain_points: r.pain_points || "",
        improvements,
        app_helpfulness: r.app_helpfulness,
        missing_feature: r.missing_feature || "",
        created_at: r.created_at,
        updated_at: r.updated_at,
      };
    });

    res.json({ items, limit, offset });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/games/:id/equipment-stock
router.get("/games/:id/equipment-stock", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    if (!gid) return res.status(400).json({ error: "Invalid game id" });

    const stockRows = await q(
      "SELECT item_key, total_qty, is_disabled, notes, updated_at FROM game_equipment_stock WHERE game_id=?",
      [gid],
    );
    const stockByKey = new Map(stockRows.map((r) => [r.item_key, r]));

    const reservedRows = await q(
      `SELECT item_key, COALESCE(SUM(quantity),0) AS reserved_qty
       FROM game_player_equipment
       WHERE game_id=?
       GROUP BY item_key`,
      [gid],
    );
    const reservedByKey = new Map(
      reservedRows.map((r) => [r.item_key, Number(r.reserved_qty) || 0]),
    );

    const items = EQUIPMENT_CATALOG.map((item) => {
      const st = stockByKey.get(item.key) || null;
      const totalQty =
        st && st.total_qty !== null && st.total_qty !== undefined
          ? Number(st.total_qty)
          : item.defaultStock;
      const reservedQty = reservedByKey.get(item.key) || 0;
      return {
        item_key: item.key,
        title: item.title,
        category: item.category,
        total_qty: totalQty,
        reserved_qty: reservedQty,
        remaining_qty:
          totalQty === null || totalQty === undefined
            ? null
            : Math.max(0, totalQty - reservedQty),
        is_disabled: st ? !!st.is_disabled : false,
        notes: st?.notes || "",
        updated_at: st?.updated_at || null,
      };
    });

    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/equipment-stock
router.post("/games/:id/equipment-stock", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const { item_key, total_qty, is_disabled, notes } = req.body || {};
    if (!gid) return res.status(400).json({ error: "Invalid game id" });
    if (!item_key || !EQUIPMENT_BY_KEY[item_key]) {
      return res.status(400).json({ error: "Unknown equipment item" });
    }
    const qty = total_qty === null || total_qty === undefined || total_qty === ""
      ? null
      : Number(total_qty);
    if (qty !== null && (!Number.isInteger(qty) || qty < 0)) {
      return res.status(400).json({ error: "total_qty must be null or non-negative integer" });
    }

    await ins(
      `INSERT INTO game_equipment_stock (game_id, item_key, total_qty, is_disabled, notes)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         total_qty=VALUES(total_qty),
         is_disabled=VALUES(is_disabled),
         notes=VALUES(notes),
         updated_at=NOW()`,
      [gid, item_key, qty, is_disabled ? 1 : 0, notes || null],
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/loot/:id/deactivate — mark loot reward as redeemed / inactive
router.get("/loot/requests", async (req, res) => {
  try {
    const rows = await q(
      `SELECT lr.id,
              lr.player_id,
              p.nickname AS player_nickname,
              lr.reward_key,
              lr.rarity,
              lr.image_url,
              lr.status,
              lr.source,
              lr.created_at
       FROM player_loot_rewards lr
       JOIN players p ON p.id = lr.player_id
       WHERE lr.status = 'active' AND lr.source = 'use_requested'
       ORDER BY lr.created_at ASC
       LIMIT 200`,
      [],
    );
    const rewardByKey = new Map(LOOT_REWARDS.map((r) => [r.key, r]));
    const requests = rows.map((r) => {
      const meta = rewardByKey.get(r.reward_key);
      return {
        ...r,
        reward_title: meta?.title || r.reward_key,
        reward_description: meta?.description || "",
      };
    });
    res.json({ requests });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/loot/:id/deactivate — mark loot reward as redeemed / inactive
router.post("/loot/:id/deactivate", async (req, res) => {
  try {
    const lootId = parseInt(req.params.id);

    if (!lootId) {
      return res.status(400).json({ error: "Invalid loot id" });
    }

    const row = await q1(
      "SELECT * FROM player_loot_rewards WHERE id=?",
      [lootId],
    );
    if (!row) {
      return res.status(404).json({ error: "Reward not found" });
    }

    await ins(
      "UPDATE player_loot_rewards SET status='redeemed', updated_at=NOW() WHERE id=?",
      [lootId],
    );

    log.info("Loot deactivated", { lootId, player_id: row.player_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// SCORING
// ============================================

/** Підсумок переможця за раундами (узгоджено з calculateGameScores). */
async function getGameFinishWinnerSummary(gid, gameMode) {
  if (gameMode === "ffa") {
    return {
      winner_game_team: null,
      winner_message:
        "Режим FFA — командного переможця немає.",
      winner_message_html:
        "🎯 <b>FFA</b> — командного переможця немає.",
      round_record_line: null,
    };
  }

  const rows = await q(
    `SELECT winner_game_team, COUNT(*) AS wins
     FROM rounds
     WHERE game_id=? AND status='finished' AND winner_game_team IN ('A','B')
     GROUP BY winner_game_team
     ORDER BY wins DESC`,
    [gid],
  );

  const fmt = (team) =>
    team === "A" ? "🟡 Команда A" : team === "B" ? "🔵 Команда B" : team;
  const short = (team) => (team === "A" ? "🟡 A" : "🔵 B");

  if (!rows.length) {
    return {
      winner_game_team: null,
      winner_message:
        "Переможець командою не визначений (немає раундів із перемогою A чи B).",
      winner_message_html:
        "⚖️ <b>Переможець командою не визначений</b> (немає перемог A/B у раундах).",
      round_record_line: null,
    };
  }

  const recordLine = rows
    .map((r) => `${short(r.winner_game_team)}: ${r.wins}`)
    .join(" · ");

  const topWins = rows[0].wins;
  const leaders = rows.filter((r) => r.wins === topWins);

  if (leaders.length > 1) {
    return {
      winner_game_team: null,
      winner_message: `Нічия за раундами (${recordLine}).`,
      winner_message_html: `⚖️ <b>Нічия за раундами</b>\n📊 ${recordLine}`,
      round_record_line: recordLine,
    };
  }

  const w = leaders[0].winner_game_team;
  return {
    winner_game_team: w,
    winner_message: `Переможець: ${fmt(w)}. Раунди: ${recordLine}.`,
    winner_message_html: `🏆 <b>Переможець: ${fmt(w)}</b>\n📊 ${recordLine}`,
    round_record_line: recordLine,
  };
}

async function calculateGameScores(gid) {
  log.info("=== CALCULATING SCORES ===", { gid });

  const g = await q1("SELECT * FROM games WHERE id=?", [gid]);

  const roundWins = await q(
    "SELECT winner_game_team, COUNT(*) as wins FROM rounds WHERE game_id=? AND status='finished' AND winner_game_team IN ('A','B') GROUP BY winner_game_team ORDER BY wins DESC",
    [gid],
  );
  // Якщо по раундах рівність (нічия) — командного переможця нема
  let winnerTeam = null;
  if (roundWins.length) {
    const topWins = Math.max(...roundWins.map((r) => r.wins));
    const leaders = roundWins.filter((r) => r.wins === topWins);
    winnerTeam = leaders.length === 1 ? leaders[0].winner_game_team : null;
  }

  const outcomeOnly = !!g.score_round_outcomes_only;

  const deathStats = await q(
    "SELECT killed_player_id, COUNT(*) as deaths FROM round_kills WHERE game_id=? GROUP BY killed_player_id",
    [gid],
  );
  const deathMap = {};
  deathStats.forEach((d) => {
    deathMap[d.killed_player_id] = d.deaths;
  });

  // Беремо поточних checked-in гравців.
  // Важливо: кікнутий під час активної гри гравець може вже бути видалений із game_players,
  // але він є у round_players. Такі гравці теж мають отримати очки за зіграні раунди.
  const gpsCheckedIn = await q(
    `SELECT gp.*, p.rating
     FROM game_players gp
     JOIN players p ON p.id = gp.player_id
     WHERE gp.game_id=? AND gp.attendance='checked_in'`,
    [gid],
  );

  const roundParticipantIds = roundOutcomeStats.map((s) => s.player_id);
  const checkedInIds = new Set(gpsCheckedIn.map((p) => p.player_id));
  const missingRoundParticipantIds = roundParticipantIds.filter(
    (pid) => !checkedInIds.has(pid),
  );

  let missingParticipants = [];
  if (missingRoundParticipantIds.length) {
    const placeholders = missingRoundParticipantIds.map(() => "?").join(",");
    const missingRatings = await q(
      `SELECT id AS player_id, rating
       FROM players
       WHERE id IN (${placeholders})`,
      missingRoundParticipantIds,
    );

    const latestTeams = await q(
      `SELECT rp.player_id, rp.game_team
       FROM round_players rp
       JOIN rounds r ON r.id = rp.round_id
       JOIN (
         SELECT rp2.player_id, MAX(r2.round_number) AS max_round_number
         FROM round_players rp2
         JOIN rounds r2 ON r2.id = rp2.round_id
         WHERE r2.game_id=? AND r2.status='finished'
         GROUP BY rp2.player_id
       ) last_by_player
         ON last_by_player.player_id = rp.player_id
        AND last_by_player.max_round_number = r.round_number
       WHERE r.game_id=? AND r.status='finished'`,
      [gid, gid],
    );
    const latestTeamMap = new Map(
      latestTeams.map((row) => [row.player_id, row.game_team || null]),
    );

    missingParticipants = missingRatings.map((p) => ({
      player_id: p.player_id,
      rating: p.rating || 0,
      game_team: latestTeamMap.get(p.player_id) || null,
    }));
  }

  const gps = [...gpsCheckedIn, ...missingParticipants];

  const playerCount = gps.length || 1;
  const multiplier = Math.max(1, Math.log(playerCount) / Math.log(6));

  log.info("Score multiplier", {
    playerCount,
    multiplier: multiplier.toFixed(2),
    checkedInCount: gpsCheckedIn.length,
    missingRoundParticipants: missingParticipants.length,
  });

  // Підрахунки по раундах мають брати `round_players.game_team`, а не фінальний `game_players.game_team`,
  // бо команди можуть оновлюватись під час гри.
  const roundOutcomeStats = await q(
    `SELECT
        rp.player_id,
        SUM(CASE WHEN rp.is_alive=1 THEN 1 ELSE 0 END) AS rounds_survived,
        SUM(CASE
          WHEN rp.is_alive=1
           AND r.status='finished'
           AND r.winner_game_team IN ('A','B')
           AND rp.game_team = r.winner_game_team
          THEN 1 ELSE 0
        END) AS rounds_alive_and_won,
        SUM(CASE
          WHEN rp.is_alive=1
           AND r.status='finished'
           AND r.winner_game_team IN ('A','B')
           AND rp.game_team <> r.winner_game_team
          THEN 1 ELSE 0
        END) AS rounds_alive_lost,
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
      WHERE r.game_id=? AND r.status='finished'
      GROUP BY rp.player_id`,
    [gid],
  );

  const roundOutcomeMap = new Map(
    roundOutcomeStats.map((s) => [
      s.player_id,
      {
        roundsSurvived: s.rounds_survived || 0,
        roundsAliveAndWon: s.rounds_alive_and_won || 0,
        roundsAliveLost: s.rounds_alive_lost || 0,
        winRoundsAll: s.win_rounds_all || 0,
        loseRoundsAll: s.lose_rounds_all || 0,
      },
    ]),
  );

  function clamp(min, val, max) {
    return Math.max(min, Math.min(val, max));
  }

  for (const gp of gps) {
    const st = roundOutcomeMap.get(gp.player_id);
    const roundsSurvived = st?.roundsSurvived ?? 0;
    const roundsAliveAndWon = st?.roundsAliveAndWon ?? 0;
    const roundsAliveLost = st?.roundsAliveLost ?? 0;
    const winRoundsAll = st?.winRoundsAll ?? 0;
    const loseRoundsAll = st?.loseRoundsAll ?? 0;

    // Під час swap’ів команди змінюються, тому “виграв/програв матч”
    // визначаємо за тим, чи більше раундів у нього виграли та програли його команди (по `rp.game_team`).
    const isDraw = winnerTeam === null;
    const isWinner = !isDraw && winRoundsAll > loseRoundsAll;
    const rawDeaths = deathMap[gp.player_id] || 0;
    const playerDeaths = outcomeOnly ? 0 : rawDeaths;
    const myRating = gp.rating || 0;

    // Суперники = всі checked-in, хто не в моїй команді
    // Для FFA теж спрацює, бо в кожного свій game_team
    const opponents = gps.filter(
      (p) => p.player_id !== gp.player_id && p.game_team !== gp.game_team,
    );

    const avgOpponentRating = opponents.length
      ? opponents.reduce((sum, p) => sum + (p.rating || 0), 0) /
        opponents.length
      : myRating;

    const ratingDiff = avgOpponentRating - myRating;

    // М'який коефіцієнт складності:
    // сильніші суперники => більше очок
    // слабші суперники => менше бонусу, але не штраф
    const difficultyFactor = clamp(0.85, 1 + ratingDiff / 1000, 1.35);

    // Стабільна база
    const basePts = Math.round(5 * multiplier);

    // Результативна частина
    // Draw gets midpoint bonus between win and loss.
    const rawWinBonus = isWinner ? 10 * multiplier : isDraw ? 5 * multiplier : 0;
    const rawSurvivalPts = 3 * multiplier * roundsSurvived;
    const rawAliveWinBonus = 2 * multiplier * roundsAliveAndWon;
    const rawAliveLoseBonus = 1 * multiplier * roundsAliveLost;

    const performanceRaw = outcomeOnly
      ? rawWinBonus
      : rawWinBonus + rawSurvivalPts + rawAliveWinBonus + rawAliveLoseBonus;

    // difficulty bonus applied only to performance
    const performancePts = Math.round(performanceRaw * difficultyFactor);

    const totalPts = basePts + performancePts;

    await ins(
      "UPDATE players SET games_played=games_played+1, wins=wins+?, total_deaths=total_deaths+?, rating=rating+? WHERE id=?",
      [isWinner ? 1 : 0, playerDeaths, totalPts, gp.player_id],
    );

    await ins(
      "UPDATE game_players SET deaths_total=?, result=? WHERE game_id=? AND player_id=?",
      [playerDeaths, isWinner ? "win" : "loss", gid, gp.player_id],
    );

    log.info("Player scored", {
      player: gp.player_id,
      myRating,
      avgOpponentRating: Math.round(avgOpponentRating),
      ratingDiff: Math.round(ratingDiff),
      difficultyFactor: difficultyFactor.toFixed(2),
      isDraw,
      isWinner,
      outcomeOnly,
      deaths: playerDeaths,
      rawDeaths,
      roundsSurvived,
      roundsAliveAndWon,
      roundsAliveLost,
      multiplier: multiplier.toFixed(2),
      basePts,
      performanceRaw: Math.round(performanceRaw),
      performancePts,
      total: totalPts,
    });

    if (g.season_id) {
      const ex = await q1(
        "SELECT * FROM season_stats WHERE player_id=? AND season_id=?",
        [gp.player_id, g.season_id],
      );

      if (ex) {
        await ins(
          "UPDATE season_stats SET season_games=season_games+1, season_wins=season_wins+?, season_deaths=season_deaths+?, season_rating=season_rating+? WHERE id=?",
          [isWinner ? 1 : 0, playerDeaths, totalPts, ex.id],
        );
      } else {
        await ins(
          "INSERT INTO season_stats (player_id,season_id,season_games,season_wins,season_kills,season_deaths,season_rating) VALUES (?,?,1,?,0,?,?)",
          [gp.player_id, g.season_id, isWinner ? 1 : 0, playerDeaths, totalPts],
        );
      }
    }

    const updatedPlayer = await q1("SELECT * FROM players WHERE id=?", [
      gp.player_id,
    ]);
    await checkBadgesAPI(gp.player_id, updatedPlayer);
  }

  // MVP votes → increment mvp_count for players with highest votes per round
  const mvpVotes = await q(
    "SELECT round_id, target_player_id, COUNT(*) as votes FROM round_mvp_votes WHERE game_id=? GROUP BY round_id, target_player_id",
    [gid],
  );

  if (mvpVotes.length) {
    const byRound = new Map();
    for (const v of mvpVotes) {
      if (!byRound.has(v.round_id)) byRound.set(v.round_id, []);
      byRound.get(v.round_id).push(v);
    }

    const mvpIds = new Set();
    for (const [roundId, arr] of byRound.entries()) {
      let max = 0;
      for (const v of arr) {
        if (v.votes > max) max = v.votes;
      }
      for (const v of arr) {
        if (v.votes === max && max > 0) {
          mvpIds.add(v.target_player_id);
        }
      }
    }

    for (const pid of mvpIds) {
      await ins(
        "UPDATE players SET mvp_count=mvp_count+1 WHERE id=?",
        [pid],
      );

      if (g.season_id) {
        const ex = await q1(
          "SELECT * FROM season_stats WHERE player_id=? AND season_id=?",
          [pid, g.season_id],
        );
        if (ex) {
          await ins(
            "UPDATE season_stats SET season_games=season_games, season_wins=season_wins, season_deaths=season_deaths, season_rating=season_rating WHERE id=?",
            [ex.id],
          );
        }
      }

      log.info("MVP counted", { gid, playerId: pid });
    }
  }

  const noShows = await q(
    "SELECT player_id FROM game_players WHERE game_id=? AND attendance='no_show'",
    [gid],
  );
  for (const ns of noShows) {
    await ins("UPDATE players SET rating=GREATEST(0,rating-5) WHERE id=?", [
      ns.player_id,
    ]);
    log.info("No-show penalty", { player: ns.player_id });
  }

  if (winnerTeam) {
    const teamBonus = Math.round(20 * multiplier);
    const winningPlayers = await q(
      "SELECT DISTINCT team_id FROM game_players WHERE game_id=? AND game_team=? AND team_id IS NOT NULL",
      [gid, winnerTeam],
    );
    for (const wp of winningPlayers) {
      await ins("UPDATE teams SET rating=rating+? WHERE id=?", [
        teamBonus,
        wp.team_id,
      ]);
    }
    log.info("Team bonus", { winnerTeam, teamBonus });
  }

  log.info("=== SCORES CALCULATED ===", {
    gid,
    winner: winnerTeam,
    playerCount,
    multiplier: multiplier.toFixed(2),
  });
}

// Badge check
async function checkBadgesAPI(playerId, stats) {
  const BADGES = require("../../constants/badges");
  const existing = new Set(
    (
      await q("SELECT badge_name FROM player_badges WHERE player_id=?", [
        playerId,
      ])
    ).map((b) => b.badge_name),
  );

  for (const b of BADGES) {
    if (!existing.has(b.name) && b.check(stats)) {
      await ins(
        "INSERT INTO player_badges (player_id,badge_name,badge_emoji) VALUES (?,?,?)",
        [playerId, b.name, b.icon || "??"],
      );
      log.info("Badge awarded", { playerId, badge: b.name });
    }
  }
}

module.exports = router;
