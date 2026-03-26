const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");
const config = require("../../config");
const bot = require("../bot")

const router = Router();

function gameDeepLink(gid) {
  if (!config.BOT_USERNAME) return null;
  return `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`;
}

async function ensureRegisteredForGame(gid, playerId) {
  const gp = await q1(
    "SELECT id FROM game_players WHERE game_id=? AND player_id=?",
    [gid, playerId],
  );
  return !!gp;
}

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
    const gameIds = games.map((g) => g.id);

    // Attach player counts in one query
    if (gameIds.length > 0) {
      const counts = await q(
        `SELECT game_id, COUNT(*) as c
         FROM game_players
         WHERE game_id IN (${gameIds.map(() => "?").join(",")})
         GROUP BY game_id`,
        gameIds,
      );
      const countMap = new Map(counts.map((r) => [r.game_id, r.c]));
      for (const g of games) {
        g.player_count = countMap.get(g.id) || 0;
      }
    }

    // Attach friends in game (if user is registered and has friends) in one query
    const tgId = req.tgUser?.id;
    if (tgId && gameIds.length > 0) {
      const me = await q1(
        "SELECT id FROM players WHERE telegram_id = ?",
        [tgId],
      );
      if (me) {
        const friendRows = await q(
          "SELECT friend_id FROM friends WHERE player_id=? AND status='accepted'",
          [me.id],
        );
        const friendIds = friendRows.map((r) => r.friend_id);
        if (friendIds.length > 0) {
          const rows = await q(
            `SELECT gp.game_id, p.nickname
             FROM game_players gp
             JOIN players p ON p.id = gp.player_id
             WHERE gp.game_id IN (${gameIds.map(() => "?").join(",")})
               AND gp.player_id IN (${friendIds.map(() => "?").join(",")})`,
            [...gameIds, ...friendIds],
          );
          const friendsByGame = new Map();
          for (const row of rows) {
            if (!friendsByGame.has(row.game_id)) friendsByGame.set(row.game_id, []);
            friendsByGame.get(row.game_id).push(row.nickname);
          }
          for (const g of games) {
            g.friends_in_game = friendsByGame.get(g.id) || [];
          }
        }
      }
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

    // Check if current user is registered / in waitlist
    const tgId = req.tgUser.id;
    const me = await q1("SELECT id FROM players WHERE telegram_id = ?", [tgId]);
    const myRegistration = me
      ? players.find((p) => p.player_id === me.id)
      : null;

    let myWaitlist = false;
    if (me && !myRegistration) {
      try {
        const w = await q1(
          "SELECT id FROM game_waitlist WHERE game_id=? AND player_id=?",
          [gid, me.id],
        );
        myWaitlist = !!w;
      } catch (e) {
        log.error("Waitlist lookup error (ignored)", { e: e.message });
      }
    }

    res.json({ game, players, rounds, myRegistration, myWaitlist });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================
// CARPOOL RIDES
// ============================================

async function getPlayerIdByTelegramId(tgId) {
  const me = await q1("SELECT id FROM players WHERE telegram_id=?", [tgId]);
  return me?.id || null;
}

async function requireRegisteredForGame(gid, playerId) {
  const gp = await q1(
    "SELECT id, attendance FROM game_players WHERE game_id=? AND player_id=?",
    [gid, playerId],
  );
  return gp || null;
}

async function getAcceptedSeats(rideId) {
  const row = await q1(
    "SELECT COALESCE(SUM(seats_requested),0) AS s FROM game_ride_requests WHERE ride_id=? AND status='accepted'",
    [rideId],
  );
  return row?.s || 0;
}

// GET /api/games/:id/rides — list ride offers + my request status
router.get("/:id/rides", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;
    const meId = await getPlayerIdByTelegramId(tgId);

    const rides = await q(
      `SELECT r.*,
              p.nickname AS owner_nickname
       FROM game_rides r
       JOIN players p ON p.id = r.owner_player_id
       WHERE r.game_id=? AND r.status='active'
       ORDER BY r.created_at DESC`,
      [gid],
    );

    // accepted seats per ride
    const rideIds = rides.map((r) => r.id);
    const accepted = rideIds.length
      ? await q(
          `SELECT ride_id, COALESCE(SUM(seats_requested),0) AS s
           FROM game_ride_requests
           WHERE ride_id IN (${rideIds.map(() => "?").join(",")})
             AND status='accepted'
           GROUP BY ride_id`,
          rideIds,
        )
      : [];
    const acceptedMap = new Map(accepted.map((a) => [a.ride_id, a.s]));

    // my request status per ride
    let myReqMap = new Map();
    if (meId && rideIds.length) {
      const myReqs = await q(
        `SELECT ride_id, status, seats_requested
         FROM game_ride_requests
         WHERE requester_player_id=? AND ride_id IN (${rideIds
           .map(() => "?")
           .join(",")})`,
        [meId, ...rideIds],
      );
      myReqMap = new Map(myReqs.map((r) => [r.ride_id, r]));
    }

    let pendingByRide = new Map();
    if (meId && rideIds.length) {
      // Owner-only pending requests (so owner can approve in webapp)
      const pending = await q(
        `SELECT rr.id AS request_id,
                rr.ride_id,
                rr.seats_requested,
                rr.created_at,
                p.id AS requester_player_id,
                p.nickname AS requester_nickname
         FROM game_ride_requests rr
         JOIN game_rides r ON r.id = rr.ride_id
         JOIN players p ON p.id = rr.requester_player_id
         WHERE rr.ride_id IN (${rideIds.map(() => "?").join(",")})
           AND rr.status='pending'
           AND r.owner_player_id=?
         ORDER BY rr.created_at ASC`,
        [...rideIds, meId],
      );
      pendingByRide = new Map();
      for (const row of pending) {
        if (!pendingByRide.has(row.ride_id)) pendingByRide.set(row.ride_id, []);
        pendingByRide.get(row.ride_id).push({
          request_id: row.request_id,
          requester_player_id: row.requester_player_id,
          requester_nickname: row.requester_nickname,
          seats_requested: row.seats_requested,
          created_at: row.created_at,
        });
      }
    }

    const out = rides.map((r) => ({
      id: r.id,
      game_id: r.game_id,
      owner_player_id: r.owner_player_id,
      owner_nickname: r.owner_nickname,
      seats_total: r.seats_total,
      seats_accepted: acceptedMap.get(r.id) || 0,
      depart_location: r.depart_location,
      depart_time: r.depart_time,
      car_make: r.car_make,
      car_color: r.car_color,
      created_at: r.created_at,
      isOwner: !!meId && meId === r.owner_player_id,
      myRequest: myReqMap.get(r.id) || null,
      pendingRequests:
        !!meId && meId === r.owner_player_id
          ? pendingByRide.get(r.id) || []
          : [],
    }));

    res.json({ rides: out });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/rides — create/update my ride offer (one per game)
router.post("/:id/rides", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;
    const meId = await getPlayerIdByTelegramId(tgId);
    if (!meId) return res.status(400).json({ error: "Not registered" });

    const gp = await requireRegisteredForGame(gid, meId);
    if (!gp) return res.status(403).json({ error: "Join the game first" });

    const {
      seats_total,
      depart_location,
      depart_time,
      car_make,
      car_color,
    } = req.body || {};

    const seats = parseInt(seats_total);
    if (!seats || seats < 1) {
      return res.status(400).json({ error: "seats_total must be >= 1" });
    }
    if (!depart_location || !String(depart_location).trim()) {
      return res.status(400).json({ error: "depart_location required" });
    }
    if (!depart_time || !String(depart_time).trim()) {
      return res.status(400).json({ error: "depart_time required" });
    }
    if (!car_make || !String(car_make).trim()) {
      return res.status(400).json({ error: "car_make required" });
    }
    if (!car_color || !String(car_color).trim()) {
      return res.status(400).json({ error: "car_color required" });
    }

    const existing = await q1(
      "SELECT id FROM game_rides WHERE game_id=? AND owner_player_id=? LIMIT 1",
      [gid, meId],
    );

    if (existing) {
      await ins(
        `UPDATE game_rides
         SET seats_total=?, depart_location=?, depart_time=?, car_make=?, car_color=?, status='active', updated_at=NOW()
         WHERE id=?`,
        [
          seats,
          String(depart_location).trim(),
          String(depart_time).trim(),
          String(car_make).trim(),
          String(car_color).trim(),
          existing.id,
        ],
      );
      return res.json({ success: true, ride_id: existing.id });
    }

    const r = await ins(
      `INSERT INTO game_rides
       (game_id, owner_player_id, seats_total, depart_location, depart_time, car_make, car_color, status, created_at)
       VALUES (?,?,?,?,?,?,?,'active',NOW())`,
      [
        gid,
        meId,
        seats,
        String(depart_location).trim(),
        String(depart_time).trim(),
        String(car_make).trim(),
        String(car_color).trim(),
      ],
    );

    res.json({ success: true, ride_id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/rides/:rideId/request — request seats
router.post("/:id/rides/:rideId/request", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const rideId = parseInt(req.params.rideId);
    const tgId = req.tgUser.id;
    const meId = await getPlayerIdByTelegramId(tgId);
    if (!meId) return res.status(400).json({ error: "Not registered" });

    const gp = await requireRegisteredForGame(gid, meId);
    if (!gp) return res.status(403).json({ error: "Join the game first" });

    const seatsRequested = parseInt(req.body?.seats_requested || 1);
    if (!seatsRequested || seatsRequested < 1) {
      return res.status(400).json({ error: "seats_requested must be >= 1" });
    }

    const ride = await q1(
      `SELECT r.*, p.telegram_id AS owner_telegram_id, p.nickname AS owner_nickname
       FROM game_rides r
       JOIN players p ON p.id=r.owner_player_id
       WHERE r.id=? AND r.game_id=? AND r.status='active'`,
      [rideId, gid],
    );
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.owner_player_id === meId) {
      return res.status(400).json({ error: "Cannot request your own ride" });
    }

    const existing = await q1(
      "SELECT id, status FROM game_ride_requests WHERE ride_id=? AND requester_player_id=? LIMIT 1",
      [rideId, meId],
    );

    if (existing && existing.status !== "pending") {
      return res.status(400).json({ error: "Request already processed" });
    }

    if (existing) {
      await ins(
        "UPDATE game_ride_requests SET seats_requested=?, status='pending' WHERE id=?",
        [seatsRequested, existing.id],
      );
    } else {
      await ins(
        `INSERT INTO game_ride_requests
         (ride_id, game_id, requester_player_id, seats_requested, status, created_at)
         VALUES (?,?,?,?, 'pending', NOW())`,
        [rideId, gid, meId, seatsRequested],
      );
    }

    // Telegram notify owner (best-effort)
    try {
      if (ride.owner_telegram_id) {
        const requester = await q1(
          "SELECT nickname FROM players WHERE id=?",
          [meId],
        );
        const g = await q1(
          "SELECT date, time, location FROM games WHERE id=?",
          [gid],
        );
        const deepLink = config.BOT_USERNAME
          ? `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`
          : undefined;

        const msg = `🚗 <b>Запит на поїздку</b>

🎮 Гра #${gid}
📅 ${g?.date || "—"} ${g?.time ? `о ${g.time}` : ""}
📍 ${g?.location || "—"}

👤 Хто: <b>${requester?.nickname || "—"}</b>
👥 Місць: <b>${seatsRequested}</b>

Відкрий гру, щоб підтвердити або відхилити.`;

        await bot.api.sendMessage(ride.owner_telegram_id, msg, {
          parse_mode: "HTML",
          reply_markup: deepLink
            ? { inline_keyboard: [[{ text: "📋 Відкрити гру", url: deepLink }]] }
            : undefined,
        });
      }
    } catch (e) {
      log.error("Ride request notify owner error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/rides/:rideId/respond — owner accepts/rejects request
router.post("/:id/rides/:rideId/respond", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const rideId = parseInt(req.params.rideId);
    const tgId = req.tgUser.id;
    const meId = await getPlayerIdByTelegramId(tgId);
    if (!meId) return res.status(400).json({ error: "Not registered" });

    const { request_id, action } = req.body || {};
    if (!request_id || !["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "request_id and action accept|reject required" });
    }

    const ride = await q1(
      "SELECT * FROM game_rides WHERE id=? AND game_id=? AND status='active'",
      [rideId, gid],
    );
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.owner_player_id !== meId) {
      return res.status(403).json({ error: "Owner only" });
    }

    const reqRow = await q1(
      `SELECT rr.*, p.telegram_id AS requester_telegram_id, p.nickname AS requester_nickname
       FROM game_ride_requests rr
       JOIN players p ON p.id = rr.requester_player_id
       WHERE rr.id=? AND rr.ride_id=? AND rr.status='pending'`,
      [request_id, rideId],
    );
    if (!reqRow) return res.status(404).json({ error: "Request not found" });

    if (action === "accept") {
      const acceptedSeats = await getAcceptedSeats(rideId);
      const remaining = ride.seats_total - acceptedSeats;
      if (reqRow.seats_requested > remaining) {
        return res.status(400).json({ error: "Not enough free seats" });
      }
      await ins(
        "UPDATE game_ride_requests SET status='accepted', responded_at=NOW() WHERE id=?",
        [reqRow.id],
      );
    } else {
      await ins(
        "UPDATE game_ride_requests SET status='rejected', responded_at=NOW() WHERE id=?",
        [reqRow.id],
      );
    }

    // Telegram notify requester (best-effort)
    try {
      if (reqRow.requester_telegram_id) {
        const g = await q1(
          "SELECT date, time, location FROM games WHERE id=?",
          [gid],
        );
        const deepLink = config.BOT_USERNAME
          ? `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`
          : undefined;

        const msg = action === "accept"
          ? `✅ <b>Твій запит на поїздку прийнято</b>

🎮 Гра #${gid}
📅 ${g?.date || "—"} ${g?.time ? `о ${g.time}` : ""}
📍 ${g?.location || "—"}

👥 Місць підтверджено: <b>${reqRow.seats_requested}</b>`
          : `❌ <b>Твій запит на поїздку відхилено</b>

🎮 Гра #${gid}
📅 ${g?.date || "—"} ${g?.time ? `о ${g.time}` : ""}
📍 ${g?.location || "—"}`;

        await bot.api.sendMessage(reqRow.requester_telegram_id, msg, {
          parse_mode: "HTML",
          reply_markup: deepLink
            ? { inline_keyboard: [[{ text: "📋 Відкрити гру", url: deepLink }]] }
            : undefined,
        });
      }
    } catch (e) {
      log.error("Ride respond notify requester error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/games/:id/rides/:rideId — owner cancels ride and notifies accepted passengers
router.delete("/:id/rides/:rideId", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const rideId = parseInt(req.params.rideId);
    const tgId = req.tgUser.id;
    const meId = await getPlayerIdByTelegramId(tgId);
    if (!meId) return res.status(400).json({ error: "Not registered" });

    const ride = await q1(
      "SELECT * FROM game_rides WHERE id=? AND game_id=? AND status='active'",
      [rideId, gid],
    );
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.owner_player_id !== meId) {
      return res.status(403).json({ error: "Owner only" });
    }

    await ins(
      "UPDATE game_rides SET status='cancelled', updated_at=NOW() WHERE id=?",
      [rideId],
    );
    await ins(
      "UPDATE game_ride_requests SET status='cancelled', responded_at=NOW() WHERE ride_id=? AND status='pending'",
      [rideId],
    );

    const accepted = await q(
      `SELECT rr.requester_player_id, rr.seats_requested, p.telegram_id
       FROM game_ride_requests rr
       JOIN players p ON p.id=rr.requester_player_id
       WHERE rr.ride_id=? AND rr.status='accepted'`,
      [rideId],
    );

    // Notify accepted passengers
    try {
      const g = await q1(
        "SELECT date, time, location FROM games WHERE id=?",
        [gid],
      );
      const deepLink = config.BOT_USERNAME
        ? `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`
        : undefined;
      for (const a of accepted) {
        if (!a.telegram_id) continue;
        await bot.api.sendMessage(
          a.telegram_id,
          `🚫 <b>Поїздку скасовано</b>

🎮 Гра #${gid}
📅 ${g?.date || "—"} ${g?.time ? `о ${g.time}` : ""}
📍 ${g?.location || "—"}

Водій скасував поїздку. Спробуй знайти іншу в грі.`,
          {
            parse_mode: "HTML",
            reply_markup: deepLink
              ? { inline_keyboard: [[{ text: "📋 Відкрити гру", url: deepLink }]] }
              : undefined,
          },
        );
      }
    } catch (e) {
      log.error("Ride cancel notify passengers error", { e: e.message });
    }

    res.json({ success: true });
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

    // Blacklist check (best-effort: якщо таблиці ще немає — ігноруємо)
    try {
      const bl = await q1(
        "SELECT id FROM player_blacklist WHERE player_id=? AND active=1",
        [player.id],
      );
      if (bl) {
        return res
          .status(403)
          .json({
            error: "Ти у чорному списку і не можеш записатися на гру",
          });
      }
    } catch (e) {
      log.error("Blacklist check error (ignored)", { e: e.message });
    }

    // already joined?
    const ex = await q1(
      "SELECT id FROM game_players WHERE game_id = ? AND player_id = ?",
      [gid, player.id],
    );
    if (ex) return res.status(400).json({ error: "Already joined" });

    // get game info
    const game = await q1(
      "SELECT id, date, time, location, max_players, payment, duration FROM games WHERE id = ?",
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
      // Спроба додати у лист очікування; якщо таблиці немає — поводимось як раніше (game full)
      try {
        const alreadyWaiting = await q1(
          "SELECT id FROM game_waitlist WHERE game_id=? AND player_id=?",
          [gid, player.id],
        );
        if (!alreadyWaiting) {
          await ins(
            "INSERT INTO game_waitlist (game_id, player_id, created_at) VALUES (?,?,NOW())",
            [gid, player.id],
          );
        }

        // Notify player in Telegram about waitlist (best-effort)
        try {
          const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: ${game.duration || "—"}`;

          await bot.api.sendMessage(
            tgId,
            `🕒 <b>Лист очікування</b>

🎮 Гра #${gid}

Ти доданий до листа очікування. Коли звільниться місце, тебе автоматично запишемо в гру.

${info}`,
            { parse_mode: "HTML" },
          );
        } catch (e) {
          log.error("Waitlist notify error", { e: e.message });
        }

        return res.json({
          success: true,
          waitlisted: true,
        });
      } catch (e) {
        // Якщо немає таблиці game_waitlist — повертаємось до старої поведінки "гра заповнена"
        log.error("Waitlist insert error, fallback to full", {
          e: e.message,
        });
        return res.status(400).json({
          error: "Game is full",
        });
      }
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

        const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: <b>${game.duration || "—"}</b>
🪙 Вартість участі: <b>${payment} грн</b>`;

        if (remaining === 30 || remaining === 20) {
          const msg = `ℹ️ <b>Оновлення по місцях</b>

🎮 Гра #${gid}
👥 Залишилось місць: <b>${remaining}</b>

${info}`;

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

        if (remaining === 10 || remaining === 5) {
          const msg = `⚠️ <b>Залишилось мало місць!</b>

🎮 Гра #${gid}
👥 Залишилось місць: <b>${remaining}</b>

${info}`;

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

        if (remaining === 1) {
          const msg = `🚨 <b>Залишилось останнє місце!</b>

🎮 Гра #${gid}
👥 Вільних місць: <b>1</b>

${info}`;

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
          const msg = `🚫 <b>Гра заповнена!</b>

🎮 Гра #${gid}
👥 Усі місця зайняті

${info}`;

          await bot.api.sendMessage(config.CHANNEL_ID, msg, {
            parse_mode: "HTML",
          });
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
      "UPDATE game_players SET attendance='checkin_pending', checkin_time=NOW() WHERE game_id=? AND player_id=?",
      [gid, player.id],
    );

    log.info("API checkin pending", { gid, nickname: player.nickname });
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
      "SELECT id, date, time, location, status, max_players, payment, duration FROM games WHERE id = ?",
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

    // If cancelling user has an active ride offer for this game — cancel it and notify accepted passengers
    try {
      const myRide = await q1(
        "SELECT id FROM game_rides WHERE game_id=? AND owner_player_id=? AND status='active' LIMIT 1",
        [gid, player.id],
      );
      if (myRide) {
        const acceptedPassengers = await q(
          `SELECT p.telegram_id
           FROM game_ride_requests rr
           JOIN players p ON p.id = rr.requester_player_id
           WHERE rr.ride_id=? AND rr.status='accepted'`,
          [myRide.id],
        );

        await ins(
          "UPDATE game_rides SET status='cancelled', updated_at=NOW() WHERE id=?",
          [myRide.id],
        );
        await ins(
          "UPDATE game_ride_requests SET status='cancelled', responded_at=NOW() WHERE ride_id=? AND status='pending'",
          [myRide.id],
        );

        const deepLink = config.BOT_USERNAME
          ? `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`
          : undefined;
        for (const p of acceptedPassengers) {
          if (!p.telegram_id) continue;
          try {
            await bot.api.sendMessage(
              p.telegram_id,
              `🚫 <b>Поїздку скасовано</b>\n\n🎮 Гра #${gid}\nВласник поїздки скасував пропозицію (ймовірно, скасував запис на гру).`,
              {
                parse_mode: "HTML",
                reply_markup: deepLink
                  ? { inline_keyboard: [[{ text: "📋 Відкрити гру", url: deepLink }]] }
                  : undefined,
              },
            );
          } catch (e) {
            log.error("Ride cancel notify error", { e: e.message });
          }
        }
      }
    } catch (e) {
      log.error("Ride cancel-on-registration-cancel error (ignored)", { e: e.message });
    }

    // If cancelling user has ride seat requests — cancel them (best-effort)
    try {
      await ins(
        "UPDATE game_ride_requests SET status='cancelled', responded_at=NOW() WHERE game_id=? AND requester_player_id=? AND status IN ('pending','accepted')",
        [gid, player.id],
      );
    } catch (e) {
      log.error("Ride requests cancel-on-registration-cancel error (ignored)", { e: e.message });
    }

    let newCount = beforeCnt.c - 1;

    // If there is a waitlist, auto-add first waiting player (best-effort)
    try {
      const waitCandidate = await q1(
        `SELECT w.player_id, p.team_id, p.telegram_id, p.nickname
         FROM game_waitlist w
         JOIN players p ON p.id = w.player_id
         LEFT JOIN player_blacklist b ON b.player_id = w.player_id AND b.active=1
         WHERE w.game_id=? AND b.player_id IS NULL
         ORDER BY w.created_at ASC
         LIMIT 1`,
        [gid],
      );

      if (waitCandidate) {
        await ins(
          "INSERT INTO game_players (game_id, player_id, team_id) VALUES (?,?,?)",
          [gid, waitCandidate.player_id, waitCandidate.team_id],
        );
        await ins(
          "DELETE FROM game_waitlist WHERE game_id=? AND player_id=?",
          [gid, waitCandidate.player_id],
        );
        newCount += 1;

        // Notify player that they were moved from waitlist into the game
        try {
          if (waitCandidate.telegram_id) {
            const deepLink = config.BOT_USERNAME
              ? `https://t.me/${config.BOT_USERNAME}?startapp=game_${gid}`
              : undefined;

            const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: ${game.duration || "—"}`;

            await bot.api.sendMessage(
              waitCandidate.telegram_id,
              `✅ <b>Ти потрапив у гру з листа очікування</b>

🎮 Гра #${gid}

${info}`,
              {
                parse_mode: "HTML",
                reply_markup: deepLink
                  ? {
                      inline_keyboard: [
                        [{ text: "📋 Відкрити гру", url: deepLink }],
                      ],
                    }
                  : undefined,
              },
            );
          }
        } catch (e) {
          log.error("Waitlist promote notify error", { e: e.message });
        }
      }
    } catch (e) {
      // Якщо немає game_waitlist / player_blacklist — тихо ігноруємо
      log.error("Waitlist promote error (ignored)", { e: e.message });
    }

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

        const info = `📅 Дата: ${game.date}
⏰ Час: ${game.time || "—"}
📍 Локація: ${game.location}
⏱ Тривалість: <b>${game.duration || "—"}</b>
🪙 Вартість участі: <b>${game.payment} грн</b>`;

        if (remainingBefore === 0 && remainingAfter > 0) {
          // was full, now at least 1 free slot
          msg = `✅ <b>З'явилося вільне місце!</b>

🎮 Гра #${gid}
👥 Вільних місць: <b>${remainingAfter}</b>

${info}`;
        } else if (remainingAfter > 0) {
          // just update current free slots
          msg = `ℹ️ <b>Оновлена кількість місць</b>

🎮 Гра #${gid}
👥 Вільних місць: <b>${remainingAfter}</b>

${info}`;
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
      "SELECT *, UNIX_TIMESTAMP(started_at) as started_at_ts FROM rounds WHERE game_id=? AND round_number=? AND status='active'",
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

// GET /api/games/:id/mvp-state — MVP voting state for latest finished round
router.get("/:id/mvp-state", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const tgId = req.tgUser.id;

    const player = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!player) return res.status(400).json({ error: "Not registered" });

    const game = await q1("SELECT * FROM games WHERE id = ?", [gid]);
    if (!game) return res.status(404).json({ error: "Game not found" });

    // latest finished round
    const round = await q1(
      "SELECT * FROM rounds WHERE game_id=? AND status='finished' ORDER BY round_number DESC LIMIT 1",
      [gid],
    );

    if (!round || !round.winner_game_team) {
      return res.json({ hasRound: false });
    }

    // voter must be checked-in and in winning game_team
    const gp = await q1(
      "SELECT * FROM game_players WHERE game_id=? AND player_id=?",
      [gid, player.id],
    );

    const canVote =
      !!gp &&
      gp.attendance === "checked_in" &&
      gp.game_team === round.winner_game_team;

    // candidates: all players from winning team in that round
    const candidates = await q(
      `SELECT rp.player_id, p.nickname, 
         COALESCE(v.votes,0) AS mvp_votes
       FROM round_players rp
       JOIN players p ON rp.player_id = p.id
       LEFT JOIN (
         SELECT target_player_id, COUNT(*) AS votes 
         FROM round_mvp_votes 
         WHERE round_id=? 
         GROUP BY target_player_id
       ) v ON v.target_player_id = rp.player_id
       WHERE rp.round_id=? AND rp.game_team=?
       ORDER BY mvp_votes DESC, p.nickname`,
      [round.id, round.id, round.winner_game_team],
    );

    // my vote (if any)
    const myVote = await q1(
      "SELECT target_player_id FROM round_mvp_votes WHERE round_id=? AND voter_player_id=? LIMIT 1",
      [round.id, player.id],
    );

    res.json({
      hasRound: true,
      round_id: round.id,
      round_number: round.round_number,
      winner_team: round.winner_game_team,
      canVote,
      myVoteTargetId: myVote?.target_player_id || null,
      candidates,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/mvp-vote — cast / change MVP vote for latest finished round
router.post("/:id/mvp-vote", async (req, res) => {
  try {
    const gid = parseInt(req.params.id);
    const { round_id, target_player_id } = req.body;
    const tgId = req.tgUser.id;

    if (!round_id || !target_player_id) {
      return res.status(400).json({ error: "round_id and target_player_id required" });
    }

    const player = await q1(
      "SELECT id FROM players WHERE telegram_id = ?",
      [tgId],
    );
    if (!player) return res.status(400).json({ error: "Not registered" });

    const game = await q1("SELECT * FROM games WHERE id = ?", [gid]);
    if (!game) return res.status(404).json({ error: "Game not found" });

    const round = await q1(
      "SELECT * FROM rounds WHERE id=? AND game_id=? AND status='finished'",
      [round_id, gid],
    );
    if (!round || !round.winner_game_team) {
      return res.status(400).json({ error: "Round not eligible for MVP voting" });
    }

    // voter must be checked-in and winner team
    const voterGp = await q1(
      "SELECT * FROM game_players WHERE game_id=? AND player_id=?",
      [gid, player.id],
    );
    if (
      !voterGp ||
      voterGp.attendance !== "checked_in" ||
      voterGp.game_team !== round.winner_game_team
    ) {
      return res.status(403).json({ error: "Only winners can vote" });
    }

    // target must be from same round & winning team
    const targetRp = await q1(
      "SELECT * FROM round_players WHERE round_id=? AND player_id=? AND game_team=?",
      [round_id, target_player_id, round.winner_game_team],
    );
    if (!targetRp) {
      return res.status(400).json({ error: "Invalid MVP target" });
    }

    const existing = await q1(
      "SELECT id FROM round_mvp_votes WHERE round_id=? AND voter_player_id=?",
      [round_id, player.id],
    );

    if (existing) {
      await ins(
        "UPDATE round_mvp_votes SET target_player_id=?, updated_at=NOW() WHERE id=?",
        [target_player_id, existing.id],
      );
    } else {
      await ins(
        "INSERT INTO round_mvp_votes (round_id,game_id,voter_player_id,target_player_id,created_at) VALUES (?,?,?,?,NOW())",
        [round_id, gid, player.id, target_player_id],
      );
    }

    log.info("MVP vote", {
      gid,
      round_id,
      voter: player.id,
      target: target_player_id,
    });

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ------------------------------------------------------------
// CARPOOL RIDES
// ------------------------------------------------------------

// GET /api/games/:id/rides — list rides for a game
router.get("/:id/rides", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    if (!gid) return res.status(400).json({ error: "Invalid game id" });

    const me = req.player;
    if (!me) return res.status(401).json({ error: "Not registered" });

    const rides = await q(
      `SELECT
         r.*,
         p.nickname AS owner_nickname,
         COALESCE(SUM(CASE WHEN rr.status='accepted' THEN rr.seats_requested ELSE 0 END), 0) AS accepted_seats
       FROM game_rides r
       JOIN players p ON p.id = r.owner_player_id
       LEFT JOIN game_ride_requests rr ON rr.ride_id = r.id
       WHERE r.game_id = ? AND r.status = 'active'
       GROUP BY r.id
       ORDER BY r.created_at DESC`,
      [gid],
    );

    let myReqMap = new Map();
    const myReqRows = await q(
      "SELECT ride_id, status, seats_requested FROM game_ride_requests WHERE game_id=? AND requester_player_id=?",
      [gid, me.id],
    );
    myReqMap = new Map(myReqRows.map((r) => [r.ride_id, r]));

    // If I'm an owner of any ride(s) in this game, load pending requests for those rides
    const myRideIds = rides
      .filter((r) => r.owner_player_id === me.id)
      .map((r) => r.id);

    const pendingByRide = new Map();
    if (myRideIds.length > 0) {
      const pendings = await q(
        `SELECT
           rr.id,
           rr.ride_id,
           rr.requester_player_id,
           rr.seats_requested,
           rr.status,
           rr.created_at,
           p.nickname AS requester_nickname
         FROM game_ride_requests rr
         JOIN players p ON p.id = rr.requester_player_id
         WHERE rr.ride_id IN (${myRideIds.map(() => "?").join(",")})
           AND rr.status = 'pending'
         ORDER BY rr.created_at ASC`,
        myRideIds,
      );
      for (const row of pendings) {
        if (!pendingByRide.has(row.ride_id)) pendingByRide.set(row.ride_id, []);
        pendingByRide.get(row.ride_id).push(row);
      }
    }

    const payload = rides.map((r) => {
      const myReq = myReqMap.get(r.id) || null;
      return {
        ...r,
        isOwner: r.owner_player_id === me.id,
        myRequestStatus: myReq ? myReq.status : null,
        mySeatsRequested: myReq ? myReq.seats_requested : null,
        pendingRequests:
          r.owner_player_id === me.id ? pendingByRide.get(r.id) || [] : [],
      };
    });

    res.json({ rides: payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/rides — create/update owner's ride (upsert)
router.post("/:id/rides", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    if (!gid) return res.status(400).json({ error: "Invalid game id" });

    const me = req.player;
    if (!me) return res.status(401).json({ error: "Not registered" });

    const isRegistered = await ensureRegisteredForGame(gid, me.id);
    if (!isRegistered) {
      return res.status(403).json({ error: "Only registered players can create rides" });
    }

    const seats_total = parseInt(req.body?.seats_total, 10);
    const depart_location = String(req.body?.depart_location || "").trim();
    const depart_time = String(req.body?.depart_time || "").trim();
    const car_make = String(req.body?.car_make || "").trim() || null;
    const car_color = String(req.body?.car_color || "").trim() || null;

    if (!Number.isFinite(seats_total) || seats_total < 1) {
      return res.status(400).json({ error: "seats_total must be >= 1" });
    }
    if (!depart_location) return res.status(400).json({ error: "depart_location required" });
    if (!depart_time) return res.status(400).json({ error: "depart_time required" });

    await ins(
      `INSERT INTO game_rides
        (game_id, owner_player_id, seats_total, depart_location, depart_time, car_make, car_color, status, created_at)
       VALUES (?,?,?,?,?,?,?,'active',NOW())
       ON DUPLICATE KEY UPDATE
         seats_total=VALUES(seats_total),
         depart_location=VALUES(depart_location),
         depart_time=VALUES(depart_time),
         car_make=VALUES(car_make),
         car_color=VALUES(car_color),
         status='active'`,
      [gid, me.id, seats_total, depart_location, depart_time, car_make, car_color],
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/rides/:rideId/request — request seats
router.post("/:id/rides/:rideId/request", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const rideId = parseInt(req.params.rideId, 10);
    if (!gid || !rideId) return res.status(400).json({ error: "Invalid id" });

    const me = req.player;
    if (!me) return res.status(401).json({ error: "Not registered" });

    const isRegistered = await ensureRegisteredForGame(gid, me.id);
    if (!isRegistered) {
      return res.status(403).json({ error: "Only registered players can request seats" });
    }

    const ride = await q1(
      "SELECT * FROM game_rides WHERE id=? AND game_id=? AND status='active'",
      [rideId, gid],
    );
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.owner_player_id === me.id) {
      return res.status(400).json({ error: "Owner cannot request own ride" });
    }

    const seats_requested = parseInt(req.body?.seats_requested ?? 1, 10);
    if (!Number.isFinite(seats_requested) || seats_requested < 1) {
      return res.status(400).json({ error: "seats_requested must be >= 1" });
    }

    const existing = await q1(
      "SELECT * FROM game_ride_requests WHERE ride_id=? AND requester_player_id=?",
      [rideId, me.id],
    );

    if (existing) {
      if (existing.status !== "pending") {
        return res.status(400).json({ error: `Request already ${existing.status}` });
      }
      await ins(
        "UPDATE game_ride_requests SET seats_requested=? WHERE id=?",
        [seats_requested, existing.id],
      );
    } else {
      await ins(
        "INSERT INTO game_ride_requests (ride_id, game_id, requester_player_id, seats_requested, status, created_at) VALUES (?,?,?,?, 'pending', NOW())",
        [rideId, gid, me.id, seats_requested],
      );
    }

    // Telegram notify owner (best-effort)
    try {
      const owner = await q1(
        "SELECT telegram_id, nickname FROM players WHERE id=?",
        [ride.owner_player_id],
      );
      if (owner?.telegram_id) {
        const game = await q1(
          "SELECT id, date, time, location FROM games WHERE id=?",
          [gid],
        );
        const deepLink = gameDeepLink(gid);
        const info = game
          ? `📅 Дата: ${game.date}\n⏰ Час: ${game.time || "—"}\n📍 Локація: ${game.location}`
          : `🎮 Гра #${gid}`;

        await bot.api.sendMessage(
          owner.telegram_id,
          `🚗 <b>Новий запит на поїздку</b>\n\n🎮 Гра #${gid}\n\n👤 Запит від: <b>${me.nickname}</b>\n🪑 Місць: <b>${seats_requested}</b>\n\n${info}`,
          {
            parse_mode: "HTML",
            reply_markup: deepLink
              ? { inline_keyboard: [[{ text: "📋 Відкрити гру", url: deepLink }]] }
              : undefined,
          },
        );
      }
    } catch (e) {
      log.error("Ride request notify error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/games/:id/rides/:rideId/respond — owner accepts/rejects a request
router.post("/:id/rides/:rideId/respond", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const rideId = parseInt(req.params.rideId, 10);
    if (!gid || !rideId) return res.status(400).json({ error: "Invalid id" });

    const me = req.player;
    if (!me) return res.status(401).json({ error: "Not registered" });

    const ride = await q1(
      "SELECT * FROM game_rides WHERE id=? AND game_id=? AND status='active'",
      [rideId, gid],
    );
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.owner_player_id !== me.id) {
      return res.status(403).json({ error: "Only ride owner can respond" });
    }

    const request_id = parseInt(req.body?.request_id, 10);
    const action = String(req.body?.action || "").trim(); // accept|reject
    if (!request_id || !["accept", "reject"].includes(action)) {
      return res.status(400).json({ error: "request_id and action (accept|reject) required" });
    }

    const rr = await q1(
      "SELECT * FROM game_ride_requests WHERE id=? AND ride_id=?",
      [request_id, rideId],
    );
    if (!rr) return res.status(404).json({ error: "Request not found" });
    if (rr.status !== "pending") {
      return res.status(400).json({ error: "Request already processed" });
    }

    if (action === "accept") {
      const accepted = await q1(
        "SELECT COALESCE(SUM(seats_requested),0) AS s FROM game_ride_requests WHERE ride_id=? AND status='accepted'",
        [rideId],
      );
      const wouldBe = (accepted?.s || 0) + rr.seats_requested;
      if (wouldBe > ride.seats_total) {
        return res.status(400).json({ error: "Not enough free seats" });
      }
      await ins(
        "UPDATE game_ride_requests SET status='accepted', responded_at=NOW() WHERE id=?",
        [rr.id],
      );
    } else {
      await ins(
        "UPDATE game_ride_requests SET status='rejected', responded_at=NOW() WHERE id=?",
        [rr.id],
      );
    }

    // Telegram notify requester (best-effort)
    try {
      const requester = await q1(
        "SELECT telegram_id, nickname FROM players WHERE id=?",
        [rr.requester_player_id],
      );
      if (requester?.telegram_id) {
        const deepLink = gameDeepLink(gid);
        const statusText = action === "accept" ? "✅ Прийнято" : "❌ Відхилено";
        await bot.api.sendMessage(
          requester.telegram_id,
          `🚗 <b>Статус запиту на поїздку</b>\n\n🎮 Гра #${gid}\n📌 ${statusText}\n🪑 Місць: <b>${rr.seats_requested}</b>`,
          {
            parse_mode: "HTML",
            reply_markup: deepLink
              ? { inline_keyboard: [[{ text: "📋 Відкрити гру", url: deepLink }]] }
              : undefined,
          },
        );
      }
    } catch (e) {
      log.error("Ride respond notify error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/games/:id/rides/:rideId — owner cancels ride
router.delete("/:id/rides/:rideId", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const rideId = parseInt(req.params.rideId, 10);
    if (!gid || !rideId) return res.status(400).json({ error: "Invalid id" });

    const me = req.player;
    if (!me) return res.status(401).json({ error: "Not registered" });

    const ride = await q1(
      "SELECT * FROM game_rides WHERE id=? AND game_id=?",
      [rideId, gid],
    );
    if (!ride) return res.status(404).json({ error: "Ride not found" });
    if (ride.owner_player_id !== me.id) {
      return res.status(403).json({ error: "Only ride owner can delete" });
    }

    const acceptedPassengers = await q(
      `SELECT p.telegram_id, p.nickname, rr.seats_requested
       FROM game_ride_requests rr
       JOIN players p ON p.id = rr.requester_player_id
       WHERE rr.ride_id=? AND rr.status='accepted'`,
      [rideId],
    );

    await ins("UPDATE game_rides SET status='cancelled' WHERE id=?", [rideId]);
    await ins(
      "UPDATE game_ride_requests SET status='cancelled', responded_at=NOW() WHERE ride_id=? AND status='pending'",
      [rideId],
    );

    // Telegram notify accepted passengers (best-effort)
    try {
      const deepLink = gameDeepLink(gid);
      for (const p of acceptedPassengers) {
        if (!p.telegram_id) continue;
        await bot.api.sendMessage(
          p.telegram_id,
          `🚫 <b>Поїздку скасовано</b>\n\n🎮 Гра #${gid}\nВласник поїздки скасував пропозицію. Будь ласка, знайди інший варіант.`,
          {
            parse_mode: "HTML",
            reply_markup: deepLink
              ? { inline_keyboard: [[{ text: "📋 Відкрити гру", url: deepLink }]] }
              : undefined,
          },
        );
      }
    } catch (e) {
      log.error("Ride cancel notify error", { e: e.message });
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
