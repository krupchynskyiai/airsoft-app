const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");
const config = require("../../config");
const bot = require("../bot");

const router = Router();

// POST /api/teams/create — any player can create a team
router.post("/create", async (req, res) => {
  try {
    const tgId = req.tgUser.id;
    const { name } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: "Team name required (min 2 chars)" });
    }

    const player = await q1("SELECT id, team_id FROM players WHERE telegram_id = ?", [tgId]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    // Check duplicate name
    const dup = await q1("SELECT id FROM teams WHERE name = ?", [name.trim()]);
    if (dup) return res.status(400).json({ error: "Team name already taken" });

    // If player is in another team — auto-leave
    if (player.team_id) {
      const oldTeam = await q1("SELECT captain_id FROM teams WHERE id = ?", [player.team_id]);
      if (oldTeam && oldTeam.captain_id === player.id) {
        await ins("UPDATE teams SET captain_id = NULL WHERE id = ?", [player.team_id]);
      }
      log.info("Player auto-left team to create new", { playerId: player.id, oldTeam: player.team_id });
    }

    // Cancel any pending applications
    await ins(
      "UPDATE team_applications SET status = 'cancelled', resolved_at = NOW() WHERE player_id = ? AND status = 'pending'",
      [player.id]
    );

    // Create team with player as captain
    const r = await ins("INSERT INTO teams (name, captain_id, rating) VALUES (?, ?, 0)", [name.trim(), player.id]);

    // Add player to the new team
    await ins("UPDATE players SET team_id = ? WHERE id = ?", [r.insertId, player.id]);

    log.info("Team created by player", { teamId: r.insertId, name: name.trim(), captain: player.id });
    res.json({ success: true, team_id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

    res.json({ team, members, myApplication, isCaptain, pendingApps, myPlayerId: me?.id || null, myTeamId: me?.team_id || null });
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

    const appRes = await ins(
      "INSERT INTO team_applications (team_id, player_id, status, message) VALUES (?, ?, 'pending', ?)",
      [tid, player.id, message || null]
    );

    log.info("Team application", { teamId: tid, playerId: player.id });

    // Notify team captain in Telegram
    try {
      const team = await q1(
        `SELECT t.name, t.captain_id, p.telegram_id AS captain_telegram_id
         FROM teams t
         LEFT JOIN players p ON t.captain_id = p.id
         WHERE t.id = ?`,
        [tid],
      );

      if (team?.captain_id && team.captain_telegram_id) {
        const applicant = await q1(
          "SELECT nickname, rating FROM players WHERE id = ?",
          [player.id],
        );

        const deepLink = config.BOT_USERNAME
          ? `https://t.me/${config.BOT_USERNAME}?startapp=team_${tid}`
          : undefined;

        const msg = `📝 <b>Нова заявка в команду</b>

🏠 Команда: <b>${team.name}</b>
🪖 Гравець: <b>${applicant?.nickname || "Гравець"}</b>
⭐ Рейтинг: <b>${applicant?.rating ?? "—"}</b>`;

        const inline_keyboard = [
          [
            {
              text: "✅ Прийняти",
              callback_data: `team_app:${tid}:${appRes.insertId}:accept`,
            },
            {
              text: "❌ Скасувати",
              callback_data: `team_app:${tid}:${appRes.insertId}:reject`,
            },
          ],
        ];

        if (deepLink) {
          inline_keyboard.push([
            {
              text: "📋 Відкрити команду",
              url: deepLink,
            },
          ]);
        }

        await bot.api.sendMessage(team.captain_telegram_id, msg, {
          parse_mode: "HTML",
          reply_markup: { inline_keyboard },
        });
      }
    } catch (e) {
      log.error("Team application notify error", { e: e.message });
    }
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
      const player = await q1(
        "SELECT id, team_id, telegram_id, nickname FROM players WHERE id = ?",
        [app.player_id],
      );
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

      // Notify player in Telegram about acceptance
      try {
        if (player.telegram_id) {
          const teamInfo = await q1("SELECT name FROM teams WHERE id = ?", [tid]);
          const deepLink = config.BOT_USERNAME
            ? `https://t.me/${config.BOT_USERNAME}?startapp=team_${tid}`
            : undefined;

          const msg = `✅ <b>Твою заявку прийнято!</b>

🏠 Команда: <b>${teamInfo?.name || "Команда"}</b>`;

          await bot.api.sendMessage(player.telegram_id, msg, {
            parse_mode: "HTML",
            reply_markup: deepLink
              ? {
                  inline_keyboard: [[{ text: "📋 Відкрити команду", url: deepLink }]],
                }
              : undefined,
          });
        }
      } catch (e) {
        log.error("Team application accepted notify error", { e: e.message });
      }
    } else {
      await ins("UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE id = ?", [application_id]);
      log.info("Application rejected", { teamId: tid, playerId: app.player_id });

      // Notify player in Telegram about rejection
      try {
        const player = await q1(
          "SELECT telegram_id FROM players WHERE id = ?",
          [app.player_id],
        );
        if (player?.telegram_id) {
          const teamInfo = await q1("SELECT name FROM teams WHERE id = ?", [tid]);
          const msg = `❌ <b>Заявку в команду відхилено</b>

🏠 Команда: <b>${teamInfo?.name || "Команда"}</b>`;

          await bot.api.sendMessage(player.telegram_id, msg, {
            parse_mode: "HTML",
          });
        }
      } catch (e) {
        log.error("Team application rejected notify error", { e: e.message });
      }
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

    const captain = await q1(
      "SELECT id, nickname FROM players WHERE telegram_id = ?",
      [tgId],
    );
    const team = await q1("SELECT captain_id, name FROM teams WHERE id = ?", [
      tid,
    ]);
    if (!captain || team.captain_id !== captain.id) {
      return res.status(403).json({ error: "Only captain can invite" });
    }

    const player = await q1(
      "SELECT id, team_id, telegram_id, nickname FROM players WHERE nickname = ?",
      [player_nickname],
    );
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

    // Notify player in Telegram about invite
    try {
      if (player.telegram_id) {
        const deepLink = config.BOT_USERNAME
          ? `https://t.me/${config.BOT_USERNAME}?startapp=team_${tid}`
          : undefined;

        const msg = `📩 <b>Тебе запрошують в команду</b>

🏠 Команда: <b>${team?.name || "Команда"}</b>
🪖 Капітан: <b>${captain.nickname}</b>`;

        await bot.api.sendMessage(player.telegram_id, msg, {
          parse_mode: "HTML",
          reply_markup: deepLink
            ? {
                inline_keyboard: [[{ text: "📋 Відкрити команду", url: deepLink }]],
              }
            : undefined,
        });
      }
    } catch (e) {
      log.error("Team invite notify error", { e: e.message });
    }
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

    const invite = await q1(
      "SELECT * FROM team_invites WHERE id = ? AND player_id = ? AND status = 'pending'",
      [inviteId, player.id],
    );
    if (!invite) return res.status(404).json({ error: "Invite not found" });

    if (action === "accept") {
      if (player.team_id) return res.status(400).json({ error: "Already in a team" });

      await ins("UPDATE players SET team_id = ? WHERE id = ?", [invite.team_id, player.id]);
      await ins("UPDATE team_invites SET status = 'accepted', resolved_at = NOW() WHERE id = ?", [inviteId]);

      // Reject other invites and applications
      await ins("UPDATE team_invites SET status = 'rejected', resolved_at = NOW() WHERE player_id = ? AND status = 'pending' AND id != ?", [player.id, inviteId]);
      await ins(
        "UPDATE team_applications SET status = 'rejected', resolved_at = NOW() WHERE player_id = ? AND status = 'pending'",
        [player.id],
      );

      log.info("Invite accepted", {
        teamId: invite.team_id,
        playerId: player.id,
      });

      // Notify captain that player accepted invite
      try {
        const meta = await q1(
          `SELECT t.name as team_name, p.telegram_id as captain_telegram_id
           FROM teams t
           JOIN players p ON t.captain_id = p.id
           WHERE t.id = ?`,
          [invite.team_id],
        );
        if (meta?.captain_telegram_id) {
          const playerInfo = await q1(
            "SELECT nickname FROM players WHERE id = ?",
            [player.id],
          );
          const deepLink = config.BOT_USERNAME
            ? `https://t.me/${config.BOT_USERNAME}?startapp=team_${invite.team_id}`
            : undefined;

          const msg = `✅ <b>Запрошення прийнято</b>

🏠 Команда: <b>${meta.team_name}</b>
🪖 Гравець: <b>${playerInfo?.nickname || "Гравець"}</b>`;

          await bot.api.sendMessage(meta.captain_telegram_id, msg, {
            parse_mode: "HTML",
            reply_markup: deepLink
              ? {
                  inline_keyboard: [[{ text: "📋 Відкрити команду", url: deepLink }]],
                }
              : undefined,
          });
        }
      } catch (e) {
        log.error("Team invite accepted notify error", { e: e.message });
      }
    } else {
      await ins("UPDATE team_invites SET status = 'rejected', resolved_at = NOW() WHERE id = ?", [inviteId]);

      // Notify captain about rejection (optional but useful)
      try {
        const meta = await q1(
          `SELECT t.name as team_name, p.telegram_id as captain_telegram_id
           FROM teams t
           JOIN players p ON t.captain_id = p.id
           WHERE t.id = ?`,
          [invite.team_id],
        );
        if (meta?.captain_telegram_id) {
          const playerInfo = await q1(
            "SELECT nickname FROM players WHERE id = ?",
            [player.id],
          );

          const msg = `❌ <b>Запрошення відхилено</b>

🏠 Команда: <b>${meta.team_name}</b>
🪖 Гравець: <b>${playerInfo?.nickname || "Гравець"}</b>`;

          await bot.api.sendMessage(meta.captain_telegram_id, msg, {
            parse_mode: "HTML",
          });
        }
      } catch (e) {
        log.error("Team invite rejected notify error", { e: e.message });
      }
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
    const player = await q1(
      "SELECT id, team_id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!player || !player.team_id) return res.status(400).json({ error: "Not in a team" });

    await ins("UPDATE players SET team_id = NULL WHERE id = ?", [player.id]);
    log.info("Player left team", { playerId: player.id, teamId: player.team_id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/:id/transfer-captain — captain hands over captaincy to another member
router.post("/:id/transfer-captain", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const { new_captain_id } = req.body;
    const tgId = req.tgUser.id;

    if (!new_captain_id) {
      return res.status(400).json({ error: "new_captain_id required" });
    }

    const captain = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    const team = await q1(
      "SELECT captain_id FROM teams WHERE id = ?",
      [tid],
    );
    if (!captain || !team || team.captain_id !== captain.id) {
      return res.status(403).json({ error: "Only captain can transfer captaincy" });
    }

    const candidate = await q1(
      "SELECT id FROM players WHERE id = ? AND team_id = ?",
      [new_captain_id, tid],
    );
    if (!candidate) {
      return res.status(400).json({ error: "New captain must be a member of the team" });
    }

    await ins("UPDATE teams SET captain_id = ? WHERE id = ?", [
      new_captain_id,
      tid,
    ]);

    log.info("Captaincy transferred", {
      teamId: tid,
      from: captain.id,
      to: new_captain_id,
    });

    // Notify new captain in Telegram
    try {
      const newCaptain = await q1(
        "SELECT telegram_id, nickname FROM players WHERE id = ?",
        [new_captain_id],
      );
      const teamInfo = await q1(
        "SELECT name FROM teams WHERE id = ?",
        [tid],
      );

      if (newCaptain?.telegram_id) {
        const msg = `👑 <b>Ти став капітаном команди</b>

🏠 Команда: <b>${teamInfo?.name || "Команда"}</b>`;

        await bot.api.sendMessage(newCaptain.telegram_id, msg, {
          parse_mode: "HTML",
        });
      }
    } catch (e) {
      log.error("Transfer captain notify error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/:id/disband — captain disbands team, all members leave
router.post("/:id/disband", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const captain = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    const team = await q1(
      "SELECT id, name, captain_id FROM teams WHERE id = ?",
      [tid],
    );
    if (!captain || !team || team.captain_id !== captain.id) {
      return res.status(403).json({ error: "Only captain can disband team" });
    }

    const members = await q(
      "SELECT id, telegram_id, nickname FROM players WHERE team_id = ?",
      [tid],
    );

    // Clear team_id for all members
    await ins("UPDATE players SET team_id = NULL WHERE team_id = ?", [tid]);

    // Clean up applications and invites
    await ins("UPDATE team_applications SET status='cancelled', resolved_at=NOW() WHERE team_id = ? AND status = 'pending'", [tid]);
    await ins("UPDATE team_invites SET status='cancelled', resolved_at=NOW() WHERE team_id = ? AND status = 'pending'", [tid]);

    // Optionally delete team
    await ins("DELETE FROM teams WHERE id = ?", [tid]);

    log.info("Team disbanded", { teamId: tid, by: captain.id });

    // Notify all members (including captain) in Telegram
    try {
      for (const m of members) {
        if (!m.telegram_id) continue;
        const msg = `🏚 <b>Команду розформовано</b>

🏠 Команда: <b>${team.name}</b>`;

        await bot.api.sendMessage(m.telegram_id, msg, {
          parse_mode: "HTML",
        });
      }
    } catch (e) {
      log.error("Team disband notify error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/teams/:id/kick — captain kicks a member
router.post("/:id/kick", async (req, res) => {
  try {
    const tid = parseInt(req.params.id);
    const { player_id } = req.body;
    const tgId = req.tgUser.id;

    if (!player_id) {
      return res.status(400).json({ error: "player_id required" });
    }

    const captain = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    const team = await q1(
      "SELECT captain_id FROM teams WHERE id = ?",
      [tid],
    );

    if (!captain || !team || team.captain_id !== captain.id) {
      return res.status(403).json({ error: "Only captain can kick members" });
    }

    if (Number(player_id) === captain.id) {
      return res.status(400).json({ error: "Captain cannot kick themselves" });
    }

    const member = await q1(
      "SELECT id, team_id, telegram_id, nickname FROM players WHERE id = ?",
      [player_id],
    );
    if (!member || member.team_id !== tid) {
      return res.status(400).json({ error: "Player is not in this team" });
    }

    await ins("UPDATE players SET team_id = NULL WHERE id = ?", [member.id]);

    log.info("Player kicked from team", {
      teamId: tid,
      playerId: member.id,
      by: captain.id,
    });

    // Notify kicked player in Telegram
    try {
      if (member.telegram_id) {
        const teamInfo = await q1(
          "SELECT name FROM teams WHERE id = ?",
          [tid],
        );
        const msg = `🚪 <b>Тебе вигнали з команди</b>

🏠 Команда: <b>${teamInfo?.name || "Команда"}</b>`;

        await bot.api.sendMessage(member.telegram_id, msg, {
          parse_mode: "HTML",
        });
      }
    } catch (e) {
      log.error("Team kick notify error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;