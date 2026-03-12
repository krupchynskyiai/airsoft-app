const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");

const router = Router();

// GET /api/teams — all teams with members count
router.get("/", async (req, res) => {
  try {
    const teams = await q(
      `SELECT t.*, p.nickname as captain_name,
        (SELECT COUNT(*) FROM players WHERE team_id = t.id) as member_count
       FROM teams t
       LEFT JOIN players p ON t.captain_id = p.id
       ORDER BY t.rating DESC`
    );
    res.json(teams);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/teams/:id — team detail with members
router.get("/:id", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const team = await q1(
      `SELECT t.*, p.nickname as captain_name
       FROM teams t LEFT JOIN players p ON t.captain_id = p.id
       WHERE t.id = ?`,
      [tid]
    );
    if (!team) return res.status(404).json({ error: "Team not found" });

    const members = await q(
      "SELECT id, nickname, rating, games_played, wins FROM players WHERE team_id = ? ORDER BY rating DESC",
      [tid]
    );

    // Check if current user has pending application
    const tgId = req.tgUser.id;
    const me = await q1("SELECT id, team_id FROM players WHERE telegram_id = ?", [tgId]);
    const myApplication = me
      ? await q1("SELECT * FROM team_applications WHERE team_id = ? AND player_id = ? AND status = 'pending'", [tid, me.id])
      : null;

    // Check if current user is captain
    const isCaptain = me && team.captain_id === me.id;

    // Pending applications (only for captain)
    let pendingApps = [];
    if (isCaptain) {
      pendingApps = await q(
        `SELECT ta.*, p.nickname, p.rating, p.games_played
         FROM team_applications ta
         JOIN players p ON ta.player_id = p.id
         WHERE ta.team_id = ? AND ta.status = 'pending'
         ORDER BY ta.created_at DESC`,
        [tid]
      );
    }

    res.json({ team, members, myApplication, isCaptain, pendingApps, myPlayerId: me?.id || null });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/:id/apply — submit application
router.post("/:id/apply", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const tgId = req.tgUser.id;
    const { message } = req.body;

    const player = await q1("SELECT id, team_id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    // If already in this team
    if (player.team_id === tid) return res.status(400).json({ error: "Already in this team" });

    // If in another team — auto-leave
    if (player.team_id) {
      // Remove captain if was captain
      const oldTeam = await q1("SELECT captain_id FROM teams WHERE id = ?", [player.team_id]);
      if (oldTeam && oldTeam.captain_id === player.id) {
        await ins("UPDATE teams SET captain_id = NULL WHERE id = ?", [player.team_id]);
      }
      await ins("UPDATE players SET team_id = NULL WHERE id = ?", [player.id]);
      log.info("Player auto-left team for application", { playerId: player.id, oldTeam: player.team_id, newTeam: tid });
    }

    // Check for existing pending application to this team
    const existing = await q1(
      "SELECT id FROM team_applications WHERE team_id = ? AND player_id = ? AND status = 'pending'",
      [tid, player.id]
    );
    if (existing) return res.status(400).json({ error: "Application already pending" });

    await ins(
      "INSERT INTO team_applications (team_id, player_id, status, message) VALUES (?, ?, 'pending', ?)",
      [tid, player.id, message || null]
    );

    log.info("Team application", { teamId: tid, playerId: player.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/:id/cancel-application — cancel own application
router.post("/:id/cancel-application", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const tgId = req.tgUser.id;
    const player = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    await ins(
      "UPDATE team_applications SET status = 'cancelled', resolved_at = NOW() WHERE team_id = ? AND player_id = ? AND status = 'pending'",
      [tid, player.id]
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/:id/resolve — captain accepts/rejects application
router.post("/:id/resolve", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const { application_id, action } = req.body; // action: 'accept' | 'reject'
    const tgId = req.tgUser.id;

    // Verify captain
    const captain = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    const team = await q1("SELECT captain_id FROM teams WHERE id = ?", [tid]);
    if (!captain || team.captain_id !== captain.id) {
      return res.status(403).json({ error: "Only captain can resolve" });
    }

    const app = await q1("SELECT * FROM team_applications WHERE id = ? AND team_id = ? AND status = 'pending'", [application_id, tid]);
    if (!app) return res.status(404).json({ error: "Application not found" });

    if (action === "accept") {
      // Check player is not already in a team
      const player = await q1("SELECT team_id FROM players WHERE id = ?", [app.player_id]);
      if (player.team_id) {
        await ins("UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE id = ?", [application_id]);
        return res.status(400).json({ error: "Player already joined another team" });
      }

      // Add player to team
      await ins("UPDATE players SET team_id = ? WHERE id = ?", [tid, app.player_id]);
      await ins("UPDATE team_applications SET status = 'accepted', resolved_at = NOW() WHERE id = ?", [application_id]);

      // Reject other pending applications from this player
      await ins(
        "UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE player_id = ? AND status = 'pending' AND id != ?",
        [app.player_id, application_id]
      );

      log.info("Application accepted", { teamId: tid, playerId: app.player_id });
    } else {
      await ins("UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE id = ?", [application_id]);
      log.info("Application rejected", { teamId: tid, playerId: app.player_id });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/:id/invite — captain invites a player
router.post("/:id/invite", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const { player_nickname } = req.body;
    const tgId = req.tgUser.id;

    const captain = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    const team = await q1("SELECT captain_id FROM teams WHERE id = ?", [tid]);
    if (!captain || team.captain_id !== captain.id) {
      return res.status(403).json({ error: "Only captain can invite" });
    }

    const player = await q1("SELECT id, team_id FROM players WHERE nickname = ?", [player_nickname]);
    if (!player) return res.status(404).json({ error: "Player not found" });
    if (player.team_id) return res.status(400).json({ error: "Player already in a team" });

    const existing = await q1(
      "SELECT id FROM team_invites WHERE team_id = ? AND player_id = ? AND status = 'pending'",
      [tid, player.id]
    );
    if (existing) return res.status(400).json({ error: "Invite already sent" });

    await ins(
      "INSERT INTO team_invites (team_id, player_id, invited_by, status) VALUES (?, ?, ?, 'pending')",
      [tid, player.id, captain.id]
    );

    log.info("Team invite sent", { teamId: tid, playerId: player.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/teams/my/invites — invites for current player
router.get("/my/invites", async (req, res) => {
  try {
    const tgId = req.tgUser.id;
    const player = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.json([]);

    const invites = await q(
      `SELECT ti.*, t.name as team_name, p.nickname as invited_by_name
       FROM team_invites ti
       JOIN teams t ON ti.team_id = t.id
       JOIN players p ON ti.invited_by = p.id
       WHERE ti.player_id = ? AND ti.status = 'pending'
       ORDER BY ti.created_at DESC`,
      [player.id]
    );

    res.json(invites);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/invites/:id/respond — accept/reject invite
router.post("/invites/:id/respond", async (req, res) => {
  try {
    const inviteId = parseInt(req.params.id);
    const { action } = req.body; // 'accept' | 'reject'
    const tgId = req.tgUser.id;

    const player = await q1("SELECT id, team_id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    const invite = await q1("SELECT * FROM team_invites WHERE id = ? AND player_id = ? AND status = 'pending'", [inviteId, player.id]);
    if (!invite) return res.status(404).json({ error: "Invite not found" });

    if (action === "accept") {
      if (player.team_id) return res.status(400).json({ error: "Already in a team" });

      await ins("UPDATE players SET team_id = ? WHERE id = ?", [invite.team_id, player.id]);
      await ins("UPDATE team_invites SET status = 'accepted', resolved_at = NOW() WHERE id = ?", [inviteId]);

      // Reject other invites and applications
      await ins("UPDATE team_invites SET status = 'rejected', resolved_at = NOW() WHERE player_id = ? AND status = 'pending' AND id != ?", [player.id, inviteId]);
      await ins("UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE player_id = ? AND status = 'pending'", [player.id]);

      log.info("Invite accepted", { teamId: invite.team_id, playerId: player.id });
    } else {
      await ins("UPDATE team_invites SET status = 'rejected', resolved_at = NOW() WHERE id = ?", [inviteId]);
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/leave — leave current team
router.post("/leave", async (req, res) => {
  try {
    const tgId = req.tgUser.id;
    const player = await q1("SELECT id, team_id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player || !player.team_id) return res.status(400).json({ error: "Not in a team" });

    // If captain, remove captain status
    const team = await q1("SELECT captain_id FROM teams WHERE id = ?", [player.team_id]);
    if (team && team.captain_id === player.id) {
      await ins("UPDATE teams SET captain_id = NULL WHERE id = ?", [player.team_id]);
    }

    await ins("UPDATE players SET team_id = NULL WHERE id = ?", [player.id]);
    log.info("Player left team", { playerId: player.id, teamId: player.team_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;