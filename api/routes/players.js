const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");

const router = Router();

// GET /api/profile — current player profile
router.get("/profile", async (req, res) => {
  try {
    const tgId = req.tgUser.id;

    const player = await q1(
      `SELECT p.*, t.name AS team_name
       FROM players p LEFT JOIN teams t ON p.team_id = t.id
       WHERE p.telegram_id = ?`,
      [tgId]
    );

    if (!player) {
      return res.json({ registered: false });
    }

    const badges = await q(
      "SELECT badge_name, badge_emoji FROM player_badges WHERE player_id = ?",
      [player.id]
    );

    const recentGames = await q(
      `SELECT g.id, g.date, g.time, g.game_mode, g.status, gp.result, gp.kills_total, gp.deaths_total
       FROM game_players gp JOIN games g ON gp.game_id = g.id
       WHERE gp.player_id = ? ORDER BY g.created_at DESC LIMIT 10`,
      [player.id]
    );

    const config = require("../../config");

    res.json({
      registered: true,
      is_admin: config.ADMINS.includes(tgId),
      player: {
        id: player.id,
        nickname: player.nickname,
        team: player.team_name,
        games_played: player.games_played,
        wins: player.wins,
        total_kills: player.total_kills,
        total_deaths: player.total_deaths,
        mvp_count: player.mvp_count,
        rating: player.rating,
        kd: player.total_deaths > 0
          ? (player.total_kills / player.total_deaths).toFixed(2)
          : player.total_kills,
        created_at: player.created_at,
      },
      badges,
      recentGames,
    });
  } catch (e) {
    log.error("API /profile error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/register
router.post("/register", async (req, res) => {
  try {
    const tgId = req.tgUser.id;
    const { nickname, team_id } = req.body;

    if (!nickname || nickname.trim().length < 2) {
      return res.status(400).json({ error: "Nickname required (min 2 chars)" });
    }

    const dup = await q1("SELECT id FROM players WHERE nickname = ?", [nickname.trim()]);
    if (dup) return res.status(400).json({ error: "Nickname taken" });

    const existing = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    if (existing) return res.status(400).json({ error: "Already registered" });

    const r = await ins(
      "INSERT INTO players (telegram_id,nickname,team_id,games_played,wins,mvp_count,total_kills,total_deaths,rating) VALUES (?,?,?,0,0,0,0,0,0)",
      [tgId, nickname.trim(), team_id || null]
    );

    log.info("API register", { tgId, nickname, id: r.insertId });
    res.json({ success: true, player_id: r.insertId });
  } catch (e) {
    log.error("API /register error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// GET /api/teams/list — for registration
router.get("/teams/list", async (req, res) => {
  try {
    const teams = await q("SELECT id, name FROM teams ORDER BY name");
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;