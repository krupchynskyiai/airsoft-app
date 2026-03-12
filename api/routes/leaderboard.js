const { Router } = require("express");
const { q, q1 } = require("../../database/helpers");

const router = Router();

// GET /api/leaderboard
router.get("/", async (req, res) => {
  try {
    const players = await q(
      "SELECT id, nickname, rating, wins, games_played, total_kills, total_deaths, mvp_count FROM players ORDER BY rating DESC LIMIT 50"
    );
    res.json(players);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leaderboard/teams
router.get("/teams", async (req, res) => {
  try {
    const teams = await q("SELECT id, name, rating FROM teams ORDER BY rating DESC LIMIT 20");
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/leaderboard/season
router.get("/season", async (req, res) => {
  try {
    const season = await q1("SELECT * FROM seasons WHERE is_active = 1 LIMIT 1");
    if (!season) return res.json({ season: null, players: [] });

    const players = await q(
      `SELECT p.nickname, ss.season_rating, ss.season_kills, ss.season_wins, ss.season_games
       FROM season_stats ss JOIN players p ON ss.player_id = p.id
       WHERE ss.season_id = ? ORDER BY ss.season_rating DESC LIMIT 20`,
      [season.id]
    );

    res.json({ season, players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;