const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");
const config = require("../../config");
const bot = require("../bot")

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
      const cnt = await q1(
        "SELECT COUNT(*) as c FROM game_players WHERE game_id = ?",
        [g.id],
      );
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
      [gid],
    );

    const rounds = await q(
      "SELECT * FROM rounds WHERE game_id = ? ORDER BY round_number",
      [gid],
    );

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

    const player = await q1(
      "SELECT id, team_id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!player) return res.status(400).json({ error: "Not registered" });

    // already joined?
    const ex = await q1(
      "SELECT id FROM game_players WHERE game_id = ? AND player_id = ?",
      [gid, player.id],
    );
    if (ex) return res.status(400).json({ error: "Already joined" });

    // get game info
    const game = await q1(
      "SELECT id, max_players, payment FROM games WHERE id = ?",
      [gid],
    );
    if (!game) return res.status(404).json({ error: "Game not found" });

    // current count
    const cnt = await q1(
      "SELECT COUNT(*) as c FROM game_players WHERE game_id = ?",
      [gid],
    );

    // check limit
    if (game.max_players && cnt.c >= game.max_players) {
      return res.status(400).json({
        error: "Game is full",
      });
    }

    // join player
    await ins(
      "INSERT INTO game_players (game_id, player_id, team_id) VALUES (?,?,?)",
      [gid, player.id, player.team_id],
    );

    const newCount = cnt.c + 1;
    const remaining = game.max_players ? game.max_players - newCount : null;
    const payment = game.payment;

    log.info("API join game", {
      gid,
      playerId: player.id,
      total: newCount,
      remaining,
    });

    // ----------------------------------
    // TELEGRAM NOTIFICATIONS
    // ----------------------------------

    if (config.CHANNEL_ID && game.max_players) {
      try {
        const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;

        if (remaining > 0) {
          const msg = `⚠️ <b>Залишилось мало місць!</b>

🎮 Гра #${gid}
👥 Залишилось місць: <b>${remaining}</b>
🪙 Вартість участі: <b>${payment} грн</b>`;

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

        // GAME FULL
        if (remaining === 0) {
          await bot.api.sendMessage(
            config.CHANNEL_ID,
            `🚫 <b>Гра заповнена!</b>

🎮 Гра #${gid}
👥 Усі місця зайняті`,
            { parse_mode: "HTML" },
          );
        }
      } catch (e) {
        log.error("Channel notify error", { e: e.message });
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

// POST /api/games/:id/checkin
router.post("/:id/checkin", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const player = await q1(
      "SELECT id, nickname FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!player) return res.status(400).json({ error: "Not registered" });

    await ins(
      "UPDATE game_players SET attendance='checked_in', checkin_time=NOW() WHERE game_id=? AND player_id=?",
      [gid, player.id],
    );

    log.info("API checkin", { gid, nickname: player.nickname });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/cancel — cancel registration
router.post("/:id/cancel", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const player = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!player) return res.status(400).json({ error: "Not registered" });

    const game = await q1(
      "SELECT id, status, max_players, payment FROM games WHERE id = ?",
      [gid],
    );
    if (!game) return res.status(404).json({ error: "Game not found" });

    // don't allow cancel after game started/finished/cancelled
    if (["active", "finished", "cancelled"].includes(game.status)) {
      return res
        .status(400)
        .json({ error: "Cannot cancel registration at this stage" });
    }

    const registration = await q1(
      "SELECT id, attendance FROM game_players WHERE game_id = ? AND player_id = ?",
      [gid, player.id],
    );
    if (!registration)
      return res.status(400).json({ error: "Not joined" });

    // allow cancel only if still in "registered" state
    if (registration.attendance && registration.attendance !== "registered") {
      return res
        .status(400)
        .json({ error: "Cannot cancel after check-in" });
    }

    const beforeCnt = await q1(
      "SELECT COUNT(*) as c FROM game_players WHERE game_id = ?",
      [gid],
    );

    await ins("DELETE FROM game_players WHERE id = ?", [registration.id]);

    const newCount = beforeCnt.c - 1;
    const remaining =
      game.max_players != null ? game.max_players - newCount : null;

    log.info("API cancel join", {
      gid,
      playerId: player.id,
      before: beforeCnt.c,
      after: newCount,
      remaining,
    });

    // Telegram notifications about free slots
    if (config.CHANNEL_ID && game.max_players) {
      try {
        const deepLink = `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;

        const remainingBefore = game.max_players - beforeCnt.c;
        const remainingAfter = game.max_players - newCount;

        let msg;

        if (remainingBefore === 0 && remainingAfter > 0) {
          // was full, now at least 1 free slot
          msg = `✅ <b>З'явилося вільне місце!</b>

🎮 Гра #${gid}
👥 Вільних місць: <b>${remainingAfter}</b>
🪙 Вартість участі: <b>${game.payment} грн</b>`;
        } else if (remainingAfter > 0) {
          // just update current free slots
          msg = `ℹ️ <b>Оновлена кількість місць</b>

🎮 Гра #${gid}
👥 Вільних місць: <b>${remainingAfter}</b>
🪙 Вартість участі: <b>${game.payment} грн</b>`;
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
        log.error("Channel cancel notify error", { e: e.message });
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

// POST /api/games/:id/imdead — self-report
router.post("/:id/imdead", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const player = await q1("SELECT id FROM players WHERE telegram_id = ?", [
      tgId,
    ]);
    if (!player) return res.status(400).json({ error: "Not registered" });

    const game = await q1("SELECT current_round FROM games WHERE id = ?", [
      gid,
    ]);
    const round = await q1(
      "SELECT id FROM rounds WHERE game_id = ? AND round_number = ? AND status = 'active'",
      [gid, game.current_round],
    );

    if (!round) return res.status(400).json({ error: "No active round" });

    const rp = await q1(
      "SELECT is_alive FROM round_players WHERE round_id=? AND player_id=?",
      [round.id, player.id],
    );
    if (!rp || !rp.is_alive)
      return res.status(400).json({ error: "Already dead" });

    await ins(
      "INSERT INTO round_kills (round_id,game_id,killed_player_id,killer_player_id,reported_by) VALUES (?,?,?,NULL,'self')",
      [round.id, gid, player.id],
    );
    await ins(
      "UPDATE round_players SET is_alive=0 WHERE round_id=? AND player_id=?",
      [round.id, player.id],
    );

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
      [gid, game.current_round],
    );

    if (!round) return res.json({ active: false, game });

    const players = await q(
      "SELECT rp.*, p.nickname FROM round_players rp JOIN players p ON rp.player_id=p.id WHERE rp.round_id=? ORDER BY rp.game_team, rp.is_alive DESC",
      [round.id],
    );

    res.json({ active: true, game, round, players });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
