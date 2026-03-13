const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const { adminMiddleware } = require("../middleware/auth");
const log = require("../../utils/logger");
const config = require("../../config");
const bot = require("../bot");

const router = Router();
router.use(adminMiddleware);

router.post("/games", async (req, res) => {
  try {
    const {
      date,
      time,
      location,
      game_mode,
      max_players,
      payment,
      checkin_lat,
      checkin_lng,
    } = req.body;

    const season = await q1("SELECT id FROM seasons WHERE is_active=1 LIMIT 1");

    const r = await ins(
      "INSERT INTO games (date,time,location,game_mode,max_players,payment,total_rounds,status,season_id,checkin_lat,checkin_lng) VALUES (?,?,?,?,?,?,0,'upcoming',?,?,?)",
      [
        date,
        time,
        location,
        game_mode || "team_vs_team",
        max_players || null,
        payment || 0,
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
          "SELECT id FROM game_players WHERE game_id=? AND attendance='checked_in'",
          [gid],
        );

        const shuffled = ps.sort(() => Math.random() - 0.5);
        const half = Math.ceil(shuffled.length / 2);

        for (let i = 0; i < shuffled.length; i++) {
          await ins("UPDATE game_players SET game_team=? WHERE id=?", [
            i < half ? "A" : "B",
            shuffled[i].id,
          ]);
        }
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

        const msg = `${labels[status] || "ℹ️ Статус гри змінено"}

🎮 Гра #${gid}`;

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

    res.json({ success: true });
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

        await bot.api.sendMessage(
          config.CHANNEL_ID,
          `🔥 <b>Почався раунд!</b>

🎮 Гра #${gid}
🔄 Раунд: <b>${nextR}</b>`,
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
    const { winner_team } = req.body;

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
            ? "🔵 Команда A"
            : winner_team === "B"
              ? "🔴 Команда B"
              : "⚪ Без переможця";

        await bot.api.sendMessage(
          config.CHANNEL_ID,
          `🏁 <b>Раунд завершено</b>

🎮 Гра #${gid}
🔄 Раунд: ${game.current_round}

🏆 Переможець: <b>${winner}</b>`,
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

// POST /api/admin/games/:id/checkin-review
router.post("/games/:id/checkin-review", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { player_id, action } = req.body; // 'confirm' | 'reject'

    if (!player_id || !["confirm", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid parameters" });
    }

    const reg = await q1(
      "SELECT attendance FROM game_players WHERE game_id=? AND player_id=?",
      [gid, player_id],
    );
    if (!reg) {
      return res.status(404).json({ error: "Player not registered for game" });
    }

    if (reg.attendance !== "checkin_pending") {
      return res
        .status(400)
        .json({ error: "Check-in not in pending state" });
    }

    if (action === "confirm") {
      await ins(
        "UPDATE game_players SET attendance='checked_in', checkin_time=COALESCE(checkin_time, NOW()) WHERE game_id=? AND player_id=?",
        [gid, player_id],
      );
    } else {
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

// ============================================
// SCORING
// ============================================

async function calculateGameScores(gid) {
  log.info("=== CALCULATING SCORES ===", { gid });

  const g = await q1("SELECT * FROM games WHERE id=?", [gid]);

  // Count checked-in players
  const playerCountRow = await q1(
    "SELECT COUNT(*) as c FROM game_players WHERE game_id=? AND attendance='checked_in'",
    [gid],
  );
  const playerCount = playerCountRow?.c || 1;

  // Logarithmic multiplier: base = 6 players (x1.0)
  const multiplier = Math.max(1, Math.log(playerCount) / Math.log(6));

  log.info("Score multiplier", {
    playerCount,
    multiplier: multiplier.toFixed(2),
  });

  // Round wins per team → overall winner
  const roundWins = await q(
    "SELECT winner_game_team, COUNT(*) as wins FROM rounds WHERE game_id=? AND winner_game_team IS NOT NULL GROUP BY winner_game_team ORDER BY wins DESC",
    [gid],
  );
  const winnerTeam = roundWins.length ? roundWins[0].winner_game_team : null;

  // Deaths per player
  const deathStats = await q(
    "SELECT killed_player_id, COUNT(*) as deaths FROM round_kills WHERE game_id=? GROUP BY killed_player_id",
    [gid],
  );
  const deathMap = {};
  deathStats.forEach((d) => {
    deathMap[d.killed_player_id] = d.deaths;
  });

  // All checked-in players
  const gps = await q(
    "SELECT * FROM game_players WHERE game_id=? AND attendance='checked_in'",
    [gid],
  );

  for (const gp of gps) {
    const isWinner = gp.game_team === winnerTeam;
    const playerDeaths = deathMap[gp.player_id] || 0;

    // Rounds survived (alive at end)
    const survivedRow = await q1(
      `SELECT COUNT(*) as c FROM round_players rp 
       JOIN rounds r ON rp.round_id = r.id 
       WHERE r.game_id=? AND rp.player_id=? AND rp.is_alive=1 AND r.status='finished'`,
      [gid, gp.player_id],
    );
    const roundsSurvived = survivedRow?.c || 0;

    // Rounds survived AND team won that round
    const aliveAndWonRow = await q1(
      `SELECT COUNT(*) as c FROM round_players rp
       JOIN rounds r ON rp.round_id = r.id
       WHERE r.game_id=? AND rp.player_id=? AND rp.is_alive=1 
       AND r.status='finished' AND r.winner_game_team=?`,
      [gid, gp.player_id, gp.game_team],
    );
    const roundsAliveAndWon = aliveAndWonRow?.c || 0;

    // Rounds survived BUT team lost that round
    const aliveLostRow = await q1(
      `SELECT COUNT(*) as c FROM round_players rp
       JOIN rounds r ON rp.round_id = r.id
       WHERE r.game_id=? AND rp.player_id=? AND rp.is_alive=1
       AND r.status='finished' AND r.winner_game_team IS NOT NULL AND r.winner_game_team!=?`,
      [gid, gp.player_id, gp.game_team],
    );
    const roundsAliveLost = aliveLostRow?.c || 0;

    // ---- SCORING FORMULA ----
    // base:          5 * mult    — participation
    // winBonus:      10 * mult   — team won overall
    // survivalPts:   3 * mult    — per each round survived
    // aliveWinBonus: 2 * mult    — survived + team won THAT round
    // aliveLoseBonus: 1 * mult   — survived but team LOST that round
    const basePts = Math.round(5 * multiplier);
    const winBonus = isWinner ? Math.round(10 * multiplier) : 0;
    const survivalPts = Math.round(3 * multiplier * roundsSurvived);
    const aliveWinBonus = Math.round(2 * multiplier * roundsAliveAndWon);
    const aliveLoseBonus = Math.round(1 * multiplier * roundsAliveLost);

    const totalPts =
      basePts + winBonus + survivalPts + aliveWinBonus + aliveLoseBonus;

    // Update player
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
      isWinner,
      deaths: playerDeaths,
      roundsSurvived,
      roundsAliveAndWon,
      roundsAliveLost,
      multiplier: multiplier.toFixed(2),
      breakdown: `base=${basePts} win=${winBonus} surv=${survivalPts} aliveWin=${aliveWinBonus} aliveLose=${aliveLoseBonus}`,
      total: totalPts,
    });

    // Season stats
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

    // Badges
    const updatedPlayer = await q1("SELECT * FROM players WHERE id=?", [
      gp.player_id,
    ]);
    await checkBadgesAPI(gp.player_id, updatedPlayer);
  }

  // No-show penalty (flat, not scaled)
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

  // Team bonus (scaled)
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
