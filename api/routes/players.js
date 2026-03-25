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
      return res.json({ registered: false, is_admin: false });
    }

    const badges = await q(
      "SELECT badge_name FROM player_badges WHERE player_id = ?",
      [player.id],
    );

    // Always use badge definitions from constants (not DB emoji)
    const BADGES = require("../../constants/badges");
    const badgesWithColor = badges.map((b) => {
      const def = BADGES.find((bd) => bd.name === b.badge_name);
      return {
        badge_name: b.badge_name,
        badge_icon: def?.icon || "Award",
        badge_color: def?.color || "#64748b",
      };
    });

    const recentGames = await q(
      `SELECT g.id, g.date, g.time, g.game_mode, g.status, gp.result, gp.kills_total, gp.deaths_total
       FROM game_players gp JOIN games g ON gp.game_id = g.id
       WHERE gp.player_id = ? ORDER BY g.created_at DESC LIMIT 10`,
      [player.id],
    );

    // Friends list (accepted)
    const friends = await q(
      `SELECT p.id, p.nickname, p.rating
       FROM friends f
       JOIN players p ON p.id = f.friend_id
       WHERE f.player_id = ? AND f.status = 'accepted'
       ORDER BY p.nickname`,
      [player.id],
    );

    const config = require("../../config");
    const isAdmin = config.ADMINS.includes(tgId);

    log.info("Profile API", { tgId, isAdmin, admins: config.ADMINS });

    res.json({
      registered: true,
      is_admin: isAdmin,
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
      badges: badgesWithColor,
      friends,
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
    const tgUsername = req.tgUser?.username
      ? String(req.tgUser.username).replace(/^@/, "").trim()
      : "";

    if (!nickname || nickname.trim().length < 2) {
      return res.status(400).json({ error: "Nickname required (min 2 chars)" });
    }

    const desiredNick = nickname.trim();
    const dup = await q1(
      "SELECT id, telegram_id, telegram_username FROM players WHERE nickname = ? LIMIT 1",
      [desiredNick],
    );

    const existing = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    if (existing) return res.status(400).json({ error: "Already registered" });

    // If there is a pre-created placeholder by telegram username, attach and reuse it.
    let placeholder = null;
    if (tgUsername) {
      try {
        placeholder = await q1(
          "SELECT id FROM players WHERE telegram_username=? AND (telegram_id IS NULL OR telegram_id=0) LIMIT 1",
          [tgUsername],
        );
      } catch (e) {
        // ignore if schema doesn't support telegram_username / nullable telegram_id yet
      }
    }

    // If nickname is taken by someone else, block it.
    // But allow if it's taken by *our own placeholder* (same telegram_username, unattached).
    if (dup) {
      const isOwnPlaceholder =
        !!placeholder && dup.id === placeholder.id;
      if (!isOwnPlaceholder) {
        return res.status(400).json({ error: "Nickname taken" });
      }
    }

    if (placeholder) {
      await ins(
        "UPDATE players SET telegram_id=?, nickname=?, team_id=? WHERE id=?",
        [tgId, desiredNick, team_id || null, placeholder.id],
      );
      log.info("API register attached placeholder", { tgId, nickname, id: placeholder.id });
      return res.json({ success: true, player_id: placeholder.id });
    }

    // Otherwise create new row (store telegram_username if available/column exists)
    let r;
    try {
      r = await ins(
        "INSERT INTO players (telegram_id,telegram_username,nickname,team_id,games_played,wins,mvp_count,total_kills,total_deaths,rating) VALUES (?,?,?,?,0,0,0,0,0,0)",
        [tgId, tgUsername || null, desiredNick, team_id || null],
      );
    } catch (e) {
      r = await ins(
        "INSERT INTO players (telegram_id,nickname,team_id,games_played,wins,mvp_count,total_kills,total_deaths,rating) VALUES (?,?,?,0,0,0,0,0,0)",
        [tgId, desiredNick, team_id || null],
      );
    }

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

// GET /api/search-players?q=falcon — search players by nickname
router.get("/search-players", async (req, res) => {
  try {
    const query = req.query.q || "";
    if (query.length < 1) return res.json([]);

    const players = await q(
      "SELECT id, nickname, rating, team_id FROM players WHERE nickname LIKE ? LIMIT 10",
      [`%${query}%`],
    );
    res.json(players);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// FRIENDS
// ============================================

// POST /api/friends/request — send friend request by nickname
router.post("/friends/request", async (req, res) => {
  try {
    const tgId = req.tgUser.id;
    const { nickname } = req.body;

    if (!nickname || !nickname.trim()) {
      return res.status(400).json({ error: "Nickname required" });
    }

    const me = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!me) return res.status(400).json({ error: "Not registered" });

    const target = await q1(
      "SELECT id FROM players WHERE nickname = ?",
      [nickname.trim()],
    );
    if (!target) return res.status(404).json({ error: "Player not found" });
    if (target.id === me.id) {
      return res.status(400).json({ error: "Cannot add yourself" });
    }

    const existing = await q1(
      "SELECT id, status FROM friends WHERE player_id=? AND friend_id=?",
      [me.id, target.id],
    );
    if (existing?.status === "accepted") {
      return res.status(400).json({ error: "Already friends" });
    }

    if (existing?.status === "pending") {
      return res.status(400).json({ error: "Request already sent" });
    }

    await ins(
      "INSERT INTO friends (player_id,friend_id,status,created_at) VALUES (?,?, 'pending', NOW())",
      [me.id, target.id],
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/friends/:id/respond — accept/reject friend request
router.post("/friends/:id/respond", async (req, res) => {
  try {
    const tgId = req.tgUser.id;
    const reqId = parseInt(req.params.id);
    const { action } = req.body; // 'accept' | 'reject'

    if (!["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "Invalid action" });
    }

    const me = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!me) return res.status(400).json({ error: "Not registered" });

    const fr = await q1(
      "SELECT * FROM friends WHERE id=? AND friend_id=? AND status='pending'",
      [reqId, me.id],
    );
    if (!fr) {
      return res.status(404).json({ error: "Request not found" });
    }

    if (action === "reject") {
      await ins(
        "UPDATE friends SET status='rejected', responded_at=NOW() WHERE id=?",
        [reqId],
      );
      return res.json({ success: true });
    }

    // accept: mark existing as accepted and create reverse row
    await ins(
      "UPDATE friends SET status='accepted', responded_at=NOW() WHERE id=?",
      [reqId],
    );

    const reverse = await q1(
      "SELECT id FROM friends WHERE player_id=? AND friend_id=?",
      [me.id, fr.player_id],
    );
    if (!reverse) {
      await ins(
        "INSERT INTO friends (player_id,friend_id,status,created_at,responded_at) VALUES (?,?, 'accepted', NOW(), NOW())",
        [me.id, fr.player_id],
      );
    } else {
      await ins(
        "UPDATE friends SET status='accepted', responded_at=NOW() WHERE id=?",
        [reverse.id],
      );
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/friends — list friends and incoming requests
router.get("/friends", async (req, res) => {
  try {
    const tgId = req.tgUser.id;

    const me = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!me) return res.json({ friends: [], incoming: [] });

    const friends = await q(
      `SELECT p.id, p.nickname, p.rating
       FROM friends f
       JOIN players p ON p.id = f.friend_id
       WHERE f.player_id = ? AND f.status = 'accepted'
       ORDER BY p.nickname`,
      [me.id],
    );

    const incoming = await q(
      `SELECT f.id, p.nickname, p.rating
       FROM friends f
       JOIN players p ON p.id = f.player_id
       WHERE f.friend_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`,
      [me.id],
    );

    res.json({ friends, incoming });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;