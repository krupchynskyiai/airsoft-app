const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");

const router = Router();

// GET /api/games — list games
router.get("/", async (req, res) => {
  try {
    const status = req.query.status; // optional filter
    let sql = "SELECT * FROM games";
    const params = [];

    if (status) {
      sql += " WHERE status = ?";
      params.push(status);
    }

    sql += " ORDER BY created_at DESC LIMIT 50";
    const games = await q(sql, params);

    // Attach player counts
    for (const g of games) {
      const cnt = await q1("SELECT COUNT(*) as c FROM game_players WHERE game_id = ?", [g.id]);
      g.player_count = cnt.c;
    }

    res.json(games);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/:id — game detail
router.get("/:id", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const game = await q1("SELECT * FROM games WHERE id = ?", [gid]);
    if (!game) return res.status(404).json({ error: "Not found" });

    const players = await q(
      `SELECT gp.*, p.nickname, p.rating, t.name as team_name
       FROM game_players gp
       JOIN players p ON gp.player_id = p.id
       LEFT JOIN teams t ON gp.team_id = t.id
       WHERE gp.game_id = ?
       ORDER BY gp.game_team, p.nickname`,
      [gid]
    );

    const rounds = await q("SELECT * FROM rounds WHERE game_id = ? ORDER BY round_number", [gid]);

    // Check if current user is registered
    const tgId = req.tgUser.id;
    const me = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    const myRegistration = me
      ? players.find((p) => p.player_id === me.id)
      : null;

    res.json({ game, players, rounds, myRegistration });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/join
router.post("/:id/join", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const player = await q1("SELECT id, team_id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    const ex = await q1("SELECT id FROM game_players WHERE game_id = ? AND player_id = ?", [gid, player.id]);
    if (ex) return res.status(400).json({ error: "Already joined" });

    await ins("INSERT INTO game_players (game_id, player_id, team_id) VALUES (?,?,?)", [gid, player.id, player.team_id]);

    const cnt = await q1("SELECT COUNT(*) as c FROM game_players WHERE game_id = ?", [gid]);
    log.info("API join game", { gid, playerId: player.id });

    res.json({ success: true, total: cnt.c });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/checkin
router.post("/:id/checkin", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const player = await q1("SELECT id, nickname FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    await ins(
      "UPDATE game_players SET attendance='checked_in', checkin_time=NOW() WHERE game_id=? AND player_id=?",
      [gid, player.id]
    );

    log.info("API checkin", { gid, nickname: player.nickname });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/imdead — self-report
router.post("/:id/imdead", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const player = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    const game = await q1("SELECT current_round FROM games WHERE id = ?", [gid]);
    const round = await q1(
      "SELECT id FROM rounds WHERE game_id = ? AND round_number = ? AND status = 'active'",
      [gid, game.current_round]
    );

    if (!round) return res.status(400).json({ error: "No active round" });

    const rp = await q1("SELECT is_alive FROM round_players WHERE round_id=? AND player_id=?", [round.id, player.id]);
    if (!rp || !rp.is_alive) return res.status(400).json({ error: "Already dead" });

    await ins(
      "INSERT INTO round_kills (round_id,game_id,killed_player_id,killer_player_id,reported_by) VALUES (?,?,?,NULL,'self')",
      [round.id, gid, player.id]
    );
    await ins("UPDATE round_players SET is_alive=0 WHERE round_id=? AND player_id=?", [round.id, player.id]);

    log.info("API self-report dead", { gid, playerId: player.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/games/:id/round — current round status
router.get("/:id/round", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const game = await q1("SELECT * FROM games WHERE id = ?", [gid]);
    if (!game) return res.status(404).json({ error: "Not found" });

    const round = await q1(
      "SELECT * FROM rounds WHERE game_id=? AND round_number=? AND status='active'",
      [gid, game.current_round]
    );

    if (!round) return res.json({ active: false, game });

    const players = await q(
      "SELECT rp.*, p.nickname FROM round_players rp JOIN players p ON rp.player_id=p.id WHERE rp.round_id=? ORDER BY rp.game_team, rp.is_alive DESC",
      [round.id]
    );

    res.json({ active: true, game, round, players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;