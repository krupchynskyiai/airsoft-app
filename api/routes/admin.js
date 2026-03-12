const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const { adminMiddleware } = require("../middleware/auth");
const log = require("../../utils/logger");

const router = Router();

// All routes require admin
router.use(adminMiddleware);

// POST /api/admin/games — create game
router.post("/games", async (req, res) => {
  try {
    const { date, time, location, game_mode, total_rounds, checkin_lat, checkin_lng } = req.body;

    const season = await q1("SELECT id FROM seasons WHERE is_active=1 LIMIT 1");

    const r = await ins(
      "INSERT INTO games (date,time,location,game_mode,total_rounds,status,season_id,checkin_lat,checkin_lng) VALUES (?,?,?,?,?,'upcoming',?,?,?)",
      [date, time, location, game_mode || "team_vs_team", total_rounds || 3, season?.id || null, checkin_lat || null, checkin_lng || null]
    );

    log.info("API create game", { id: r.insertId });
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
    await ins("UPDATE games SET status=? WHERE id=?", [status, gid]);

    if (status === "active") {
      // Mark no-shows & start round 1
      await ins("UPDATE game_players SET attendance='no_show' WHERE game_id=? AND attendance='registered'", [gid]);
      const g = await q1("SELECT * FROM games WHERE id=?", [gid]);

      // Assign teams
      if (g.game_mode === "team_vs_team") {
        const teamIds = await q("SELECT DISTINCT team_id FROM game_players WHERE game_id=? AND attendance='checked_in' AND team_id IS NOT NULL", [gid]);
        let letter = "A";
        for (const t of teamIds) {
          await ins("UPDATE game_players SET game_team=? WHERE game_id=? AND team_id=? AND attendance='checked_in'", [letter, gid, t.team_id]);
          letter = String.fromCharCode(letter.charCodeAt(0) + 1);
        }
      }
      if (g.game_mode === "random_teams") {
        const ps = await q("SELECT id FROM game_players WHERE game_id=? AND attendance='checked_in'", [gid]);
        const shuffled = ps.sort(() => Math.random() - 0.5);
        const half = Math.ceil(shuffled.length / 2);
        for (let i = 0; i < shuffled.length; i++) {
          await ins("UPDATE game_players SET game_team=? WHERE id=?", [i < half ? "A" : "B", shuffled[i].id]);
        }
      }
      if (g.game_mode === "ffa") {
        const ps = await q("SELECT id, player_id FROM game_players WHERE game_id=? AND attendance='checked_in'", [gid]);
        for (const p of ps) await ins("UPDATE game_players SET game_team=? WHERE id=?", [String(p.player_id), p.id]);
      }

      await ins("UPDATE games SET current_round=1 WHERE id=?", [gid]);
      await ins("INSERT INTO rounds (game_id,round_number,status,started_at) VALUES (?,1,'active',NOW())", [gid]);
      const round = await q1("SELECT id FROM rounds WHERE game_id=? AND round_number=1", [gid]);
      const aps = await q("SELECT player_id,game_team FROM game_players WHERE game_id=? AND attendance='checked_in'", [gid]);
      for (const ap of aps) {
        await ins("INSERT INTO round_players (round_id,player_id,game_team,is_alive,kills) VALUES (?,?,?,1,0)", [round.id, ap.player_id, ap.game_team]);
      }
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/games/:id/kill — admin marks kill
router.post("/games/:id/kill", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { player_id } = req.body;

    const game = await q1("SELECT current_round FROM games WHERE id=?", [gid]);
    const round = await q1("SELECT id FROM rounds WHERE game_id=? AND round_number=? AND status='active'", [gid, game.current_round]);
    if (!round) return res.status(400).json({ error: "No active round" });

    await ins("INSERT INTO round_kills (round_id,game_id,killed_player_id,reported_by) VALUES (?,?,?,'admin')", [round.id, gid, player_id]);
    await ins("UPDATE round_players SET is_alive=0 WHERE round_id=? AND player_id=?", [round.id, player_id]);

    log.info("API admin kill", { gid, killed: player_id });
    res.json({ success: true });
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
    const round = await q1("SELECT id FROM rounds WHERE game_id=? AND round_number=? AND status='active'", [gid, game.current_round]);
    if (!round) return res.status(400).json({ error: "No active round" });

    await ins("UPDATE rounds SET winner_game_team=?, status='finished', ended_at=NOW() WHERE id=?", [winner_team, round.id]);

    if (game.current_round < game.total_rounds) {
      const nextR = game.current_round + 1;
      await ins("UPDATE games SET current_round=? WHERE id=?", [nextR, gid]);
      await ins("INSERT INTO rounds (game_id,round_number,status,started_at) VALUES (?,?,'active',NOW())", [gid, nextR]);
      const newRound = await q1("SELECT id FROM rounds WHERE game_id=? AND round_number=?", [gid, nextR]);
      const aps = await q("SELECT player_id,game_team FROM game_players WHERE game_id=? AND attendance='checked_in'", [gid]);
      for (const ap of aps) {
        await ins("INSERT INTO round_players (round_id,player_id,game_team,is_alive,kills) VALUES (?,?,?,1,0)", [newRound.id, ap.player_id, ap.game_team]);
      }
      res.json({ success: true, nextRound: nextR });
    } else {
      await ins("UPDATE games SET status='finished' WHERE id=?", [gid]);
      res.json({ success: true, finished: true });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/teams
router.post("/teams", async (req, res) => {
  try {
    const { name } = req.body;
    const r = await ins("INSERT INTO teams (name,rating) VALUES (?,0)", [name]);
    res.json({ success: true, team_id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/admin/points
router.post("/points", async (req, res) => {
  try {
    const { nickname, amount } = req.body;
    const p = await q1("SELECT id, rating FROM players WHERE nickname=?", [nickname]);
    if (!p) return res.status(404).json({ error: "Player not found" });
    const nr = Math.max(0, p.rating + amount);
    await ins("UPDATE players SET rating=? WHERE id=?", [nr, p.id]);
    res.json({ success: true, newRating: nr });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;