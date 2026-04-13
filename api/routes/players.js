const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");
const {
  telegramIdNumber,
  resolveTelegramUsername,
} = require("../../utils/telegramUsername");
const { syncTelegramUsernameWithDbPlayer } = require("../../services/playerTelegramUsernameSync");
const { loadPlayerByTelegram } = require("../middleware/auth");

const router = Router();

// GET /api/profile — current player profile
router.get("/profile", async (req, res) => {
  try {
    const tgId = req.tgUser.id;

    let base = req.player;
    if (!base) {
      try {
        base = await loadPlayerByTelegram(req.tgUser);
        req.player = base;
      } catch (e) {
        log.warn("Profile: ensure player failed", { err: e.message });
      }
    }

    if (!base) {
      return res.json({ registered: false, is_admin: false });
    }

    const player = await q1(
      `SELECT p.*, t.name AS team_name
       FROM players p LEFT JOIN teams t ON p.team_id = t.id
       WHERE p.id = ?`,
      [base.id],
    );

    if (!player) {
      return res.json({ registered: false, is_admin: false });
    }

    const badges = await q(
      "SELECT badge_name, badge_emoji FROM player_badges WHERE player_id = ?",
      [player.id],
    );

    // Always use badge definitions from constants (not DB emoji)
    const BADGES = require("../../constants/badges");
    const badgesWithColor = badges.map((b) => {
      const def = BADGES.find((bd) => bd.name === b.badge_name);
      return {
        badge_name: b.badge_name,
        badge_emoji: def?.emoji || b.badge_emoji || "",
        badge_icon: def?.icon || "Award",
        badge_color: def?.color || "#64748b",
        badge_description:
          def?.description ||
          "Нагорода з історії клубу; актуальні умови дивись у правилах бейджів.",
      };
    });

    const recentGames = await q(
      `SELECT g.id, g.date, g.time, g.game_mode, g.status, gp.result, gp.kills_total, gp.deaths_total
       FROM game_players gp JOIN games g ON gp.game_id = g.id
       WHERE gp.player_id = ? ORDER BY g.created_at DESC LIMIT 10`,
      [player.id],
    );

    // Resolve draw status for game history (based on finished rounds scoreline).
    for (const game of recentGames) {
      game.resolved_result = game.result;
      if (game.status !== "finished") continue;

      const roundWins = await q(
        `SELECT winner_game_team, COUNT(*) AS wins
         FROM rounds
         WHERE game_id=? AND status='finished' AND winner_game_team IN ('A','B')
         GROUP BY winner_game_team`,
        [game.id],
      );

      if (!roundWins.length) {
        game.resolved_result = "draw";
        continue;
      }

      const topWins = Math.max(...roundWins.map((r) => r.wins || 0));
      const leaders = roundWins.filter((r) => (r.wins || 0) === topWins);
      if (leaders.length !== 1) {
        game.resolved_result = "draw";
      }
    }

    // Survival stats by actual rounds (finished only)
    const roundsPlayedRow = await q1(
      `SELECT COUNT(*) AS c
       FROM round_players rp
       JOIN rounds r ON r.id = rp.round_id
       WHERE rp.player_id=? AND r.status='finished'`,
      [player.id],
    );
    const roundsSurvivedRow = await q1(
      `SELECT COUNT(*) AS c
       FROM round_players rp
       JOIN rounds r ON r.id = rp.round_id
       WHERE rp.player_id=? AND r.status='finished' AND rp.is_alive=1`,
      [player.id],
    );
    const roundsPlayed = roundsPlayedRow?.c || 0;
    const roundsSurvived = roundsSurvivedRow?.c || 0;

    // Friends list (accepted)
    const friends = await q(
      `SELECT p.id, p.nickname, p.callsign, p.rating
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
        callsign: player.callsign || null,
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
      roundStats: {
        rounds_played: roundsPlayed,
        rounds_survived: roundsSurvived,
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

// POST /api/profile/callsign — set player callsign (self-service once)
router.post("/profile/callsign", async (req, res) => {
  try {
    const tgId = req.tgUser.id;
    const raw = req.body?.callsign;
    const callsign = String(raw || "").trim();

    if (!callsign) {
      return res.status(400).json({ error: "Позивний обов'язковий" });
    }
    if (callsign.length > 24) {
      return res.status(400).json({ error: "Максимум 24 символи" });
    }
    if (!/^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]+$/u.test(callsign)) {
      return res.status(400).json({ error: "Позивний має містити тільки кириличні літери" });
    }

    const me = await q1("SELECT id, callsign FROM players WHERE telegram_id = ?", [tgId]);
    if (!me) return res.status(400).json({ error: "Not registered" });

    // Allow setting only when empty; further changes should be admin-only.
    if (me.callsign && String(me.callsign).trim() !== "") {
      return res.status(400).json({ error: "Позивний вже встановлено. Для зміни звернись до адміна." });
    }

    const dup = await q1(
      "SELECT id FROM players WHERE callsign = ? AND id <> ? LIMIT 1",
      [callsign, me.id],
    );
    if (dup) {
      return res.status(400).json({ error: "Такий позивний уже зайнятий" });
    }

    await ins("UPDATE players SET callsign=? WHERE id=?", [callsign, me.id]);
    return res.json({ success: true, callsign });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /api/register — профіль створюється автоматично в auth; тут лише оновлення команди (legacy / міні-ап)
router.post("/register", async (req, res) => {
  try {
    const tgId = telegramIdNumber(req.tgUser.id) || req.tgUser.id;
    const { nickname, team_id } = req.body;

    let row = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);

    if (!row) {
      const created = await loadPlayerByTelegram(req.tgUser);
      if (!created?.id) {
        return res.status(500).json({ error: "Could not create player" });
      }
      row = { id: created.id };
    }

    // Опційно: кастомний нік (старі клієнти); інакше лишаємо авто @username / player_<id>
    if (nickname && String(nickname).trim().length >= 2) {
      const desiredNick = String(nickname).trim();
      const taken = await q1(
        "SELECT id FROM players WHERE nickname = ? AND id <> ? LIMIT 1",
        [desiredNick, row.id],
      );
      if (taken) {
        return res.status(400).json({ error: "Nickname taken" });
      }
      const storedTg = resolveTelegramUsername(req.tgUser?.username, desiredNick);
      try {
        await ins(
          "UPDATE players SET nickname=?, telegram_username=COALESCE(NULLIF(telegram_username,''), ?) WHERE id=?",
          [desiredNick, storedTg || null, row.id],
        );
      } catch (e) {
        await ins("UPDATE players SET nickname=? WHERE id=?", [desiredNick, row.id]);
      }
    }
    if (team_id !== undefined) {
      await ins("UPDATE players SET team_id=? WHERE id=?", [team_id || null, row.id]);
    }

    const full = await q1("SELECT * FROM players WHERE id=?", [row.id]);
    if (full) await syncTelegramUsernameWithDbPlayer(full, req.tgUser);

    log.info("API register", { tgId, playerId: row.id });
    res.json({ success: true, player_id: row.id });
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
      `SELECT p.id, p.nickname, p.callsign, p.rating
       FROM friends f
       JOIN players p ON p.id = f.friend_id
       WHERE f.player_id = ? AND f.status = 'accepted'
       ORDER BY p.nickname`,
      [me.id],
    );

    const incoming = await q(
      `SELECT f.id, p.nickname, p.callsign, p.rating
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