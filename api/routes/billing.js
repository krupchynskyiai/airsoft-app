const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const { adminMiddleware } = require("../middleware/auth");
const ExcelJS = require("exceljs");
const config = require("../../config");
const bot = require("../bot");
const { LOOT_REWARDS } = require("../../constants/lootRewards");

const router = Router();

const CATEGORIES = [
  "extra_weapon",
  "bb",
  "grenade",
  "smoke",
  "mini_bar",
  "repair",
];
const PLAYER_BASE_PRICE = 700;
const ORGANIZER_BASE_PRICE = 500;

// Map of reward_key -> billing metadata for fast lookups in settlement.
const LOOT_BILLING_BY_KEY = new Map(
  LOOT_REWARDS.filter((r) => r.billing && r.billing.basePriceDiscountPercent > 0).map(
    (r) => [r.key, r.billing],
  ),
);

// A reward "counts" against a game's settlement once it has been bound to
// that game AND either the player requested to use it OR the admin redeemed it.
// Rewards still sitting in inventory (source='spin', status='active') do not
// reduce anyone's bill until the player explicitly claims them for a game.
function lootRewardAppliesToSettlement(row) {
  if (!row || !row.game_id) return false;
  if (row.status === "redeemed") return true;
  if (row.status === "active" && row.source === "use_requested") return true;
  return false;
}

function toNonNegativeInt(v, fallback = 0) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.floor(n));
}

function parseCategoryPayload(body, key) {
  const modeRaw = String(body?.[`${key}_mode`] || "amount").trim();
  const mode = modeRaw === "qty_price" ? "qty_price" : "amount";
  const amount = toNonNegativeInt(body?.[`${key}_amount`], 0);
  const qty = body?.[`${key}_qty`] === "" ? null : toNonNegativeInt(body?.[`${key}_qty`], 0);
  const unitPrice =
    body?.[`${key}_unit_price`] === ""
      ? null
      : toNonNegativeInt(body?.[`${key}_unit_price`], 0);
  return { mode, amount, qty, unitPrice };
}

function resolveCategoryAmount(row, key) {
  const mode = row?.[`${key}_mode`] === "qty_price" ? "qty_price" : "amount";
  if (mode === "qty_price") {
    const qty = toNonNegativeInt(row?.[`${key}_qty`], 0);
    const unit = toNonNegativeInt(row?.[`${key}_unit_price`], 0);
    return qty * unit;
  }
  return toNonNegativeInt(row?.[`${key}_amount`], 0);
}

function buildBillingTotals(row) {
  const perCategory = {};
  let extrasTotal = 0;
  for (const key of CATEGORIES) {
    const value = resolveCategoryAmount(row, key);
    perCategory[key] = value;
    extrasTotal += value;
  }
  return { perCategory, extrasTotal };
}

function parseMoneyAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

function computeSettlementRow(
  playerRow,
  prepaymentAmount,
  paymentEventAmount,
  appliedLootRewards = [],
) {
  const extrasDue = Number(playerRow?.computed?.extras_total || 0);
  const prepayment = Number(prepaymentAmount || 0);
  const payments = Number(paymentEventAmount || 0);
  const paidTotal = prepayment + payments;

  // Loot discounts only reduce the player-facing (public) base price. The
  // organizer still collects their fixed share per slot — the club absorbs
  // any bonus discounts.
  let lootDiscount = 0;
  const lootApplied = [];
  for (const r of appliedLootRewards) {
    const meta = LOOT_BILLING_BY_KEY.get(r.reward_key);
    if (!meta || !meta.basePriceDiscountPercent) continue;
    const delta = Math.floor(
      (PLAYER_BASE_PRICE * meta.basePriceDiscountPercent) / 100,
    );
    if (delta <= 0) continue;
    lootDiscount += delta;
    lootApplied.push({
      reward_id: r.id,
      reward_key: r.reward_key,
      discount_percent: meta.basePriceDiscountPercent,
      discount_amount: delta,
      status: r.status,
      source: r.source,
    });
  }

  const basePublic = Math.max(0, PLAYER_BASE_PRICE - lootDiscount);
  const grossPublic = basePublic + extrasDue;
  const grossOrganizer = ORGANIZER_BASE_PRICE + extrasDue;

  const debtPublic = Math.max(0, grossPublic - paidTotal);
  const debtOrganizer = Math.max(0, grossOrganizer - paidTotal);

  return {
    extras_due: extrasDue,
    base_due_public: basePublic,
    base_due_public_before_loot: PLAYER_BASE_PRICE,
    base_due_organizer: ORGANIZER_BASE_PRICE,
    loot_discount: lootDiscount,
    loot_rewards: lootApplied,
    gross_due_public: grossPublic,
    gross_due_organizer: grossOrganizer,
    prepayment_amount: prepayment,
    payment_events_amount: payments,
    paid_total: paidTotal,
    debt_public: debtPublic,
    debt_organizer: debtOrganizer,
    is_paid_public: debtPublic <= 0,
  };
}

async function loadBillingContext(gid) {
  const game = await q1(
    "SELECT id, status, payment, date, time, location FROM games WHERE id=?",
    [gid],
  );
  if (!game) return null;

  // NOTE: columns from `b.*` include `player_id`/`game_id`/`id`, which would
  // silently overwrite the ones from `gp`/`p` when the row has no billing
  // record (LEFT JOIN → NULLs). Explicitly alias gp.player_id so the mapping
  // below gets the correct id regardless of billing presence.
  const rows = await q(
    `SELECT
        gp.player_id AS player_id,
        COALESCE(p.callsign, p.nickname) AS player_name,
        p.telegram_username,
        p.telegram_id,
        gp.attendance,
        b.extra_weapon_mode, b.extra_weapon_amount, b.extra_weapon_qty, b.extra_weapon_unit_price,
        b.bb_mode, b.bb_amount, b.bb_qty, b.bb_unit_price,
        b.grenade_mode, b.grenade_amount, b.grenade_qty, b.grenade_unit_price,
        b.smoke_mode, b.smoke_amount, b.smoke_qty, b.smoke_unit_price,
        b.mini_bar_mode, b.mini_bar_amount, b.mini_bar_qty, b.mini_bar_unit_price,
        b.repair_mode, b.repair_amount, b.repair_qty, b.repair_unit_price
     FROM game_players gp
     JOIN players p ON p.id = gp.player_id
     LEFT JOIN game_player_billing b
       ON b.game_id = gp.game_id AND b.player_id = gp.player_id
     WHERE gp.game_id=? AND gp.attendance IN ('checked_in','left_early')
     ORDER BY player_name ASC`,
    [gid],
  );

  const players = rows.map((r) => {
    const totals = buildBillingTotals(r);
    return {
      player_id: r.player_id,
      player_name: r.player_name,
      telegram_username: r.telegram_username,
      telegram_id: r.telegram_id || null,
      attendance: r.attendance,
      billing: {
        extra_weapon_mode: r.extra_weapon_mode || "amount",
        extra_weapon_amount: toNonNegativeInt(r.extra_weapon_amount, 0),
        extra_weapon_qty: r.extra_weapon_qty,
        extra_weapon_unit_price: r.extra_weapon_unit_price,
        bb_mode: r.bb_mode || "amount",
        bb_amount: toNonNegativeInt(r.bb_amount, 0),
        bb_qty: r.bb_qty,
        bb_unit_price: r.bb_unit_price,
        grenade_mode: r.grenade_mode || "amount",
        grenade_amount: toNonNegativeInt(r.grenade_amount, 0),
        grenade_qty: r.grenade_qty,
        grenade_unit_price: r.grenade_unit_price,
        smoke_mode: r.smoke_mode || "amount",
        smoke_amount: toNonNegativeInt(r.smoke_amount, 0),
        smoke_qty: r.smoke_qty,
        smoke_unit_price: r.smoke_unit_price,
        mini_bar_mode: r.mini_bar_mode || "amount",
        mini_bar_amount: toNonNegativeInt(r.mini_bar_amount, 0),
        mini_bar_qty: r.mini_bar_qty,
        mini_bar_unit_price: r.mini_bar_unit_price,
        repair_mode: r.repair_mode || "amount",
        repair_amount: toNonNegativeInt(r.repair_amount, 0),
        repair_qty: r.repair_qty,
        repair_unit_price: r.repair_unit_price,
      },
      computed: {
        categories: totals.perCategory,
        extras_total: totals.extrasTotal,
      },
    };
  });

  return {
    game: {
      id: game.id,
      status: game.status,
      base_price: toNonNegativeInt(game.payment, 0),
      date: game.date || null,
      time: game.time || null,
      location: game.location || null,
    },
    players,
  };
}

async function loadSettlementContext(gid) {
  const billing = await loadBillingContext(gid);
  if (!billing) return null;
  const playerIds = billing.players.map((p) => p.player_id);
  if (!playerIds.length) {
    return {
      ...billing,
      rows: [],
      totals: {
        count: 0,
        gross_due_public: 0,
        gross_due_organizer: 0,
        paid_total: 0,
        debt_public: 0,
        debt_organizer: 0,
      },
    };
  }

  const placeholders = playerIds.map(() => "?").join(",");
  const prepayments = await q(
    `SELECT player_id, amount, note
     FROM game_player_prepayments
     WHERE game_id=? AND player_id IN (${placeholders})`,
    [gid, ...playerIds],
  );
  const paymentEvents = await q(
    `SELECT player_id, COALESCE(SUM(amount),0) AS total_amount
     FROM game_player_payment_events
     WHERE game_id=? AND player_id IN (${placeholders})
     GROUP BY player_id`,
    [gid, ...playerIds],
  );

  // Loot rewards the player has bound to this specific game. We accept both
  // pending-use and already-redeemed rewards here so that a discount always
  // stays reflected in the settlement once the player has earmarked it,
  // regardless of whether the admin has closed it out yet.
  const lootRewards = await q(
    `SELECT id, player_id, reward_key, status, source
     FROM player_loot_rewards
     WHERE game_id=? AND player_id IN (${placeholders})
       AND (
         (status='active' AND source='use_requested')
         OR status='redeemed'
       )`,
    [gid, ...playerIds],
  );

  const prepayMap = new Map(
    prepayments.map((r) => [Number(r.player_id), { amount: Number(r.amount || 0), note: r.note || "" }]),
  );
  const eventMap = new Map(
    paymentEvents.map((r) => [Number(r.player_id), Number(r.total_amount || 0)]),
  );
  const lootByPlayer = new Map();
  for (const r of lootRewards) {
    if (!lootRewardAppliesToSettlement(r)) continue;
    const pid = Number(r.player_id);
    const list = lootByPlayer.get(pid) || [];
    list.push(r);
    lootByPlayer.set(pid, list);
  }

  const rows = billing.players.map((p) => {
    const prepay = prepayMap.get(Number(p.player_id)) || { amount: 0, note: "" };
    const paymentAmount = eventMap.get(Number(p.player_id)) || 0;
    const playerLoot = lootByPlayer.get(Number(p.player_id)) || [];
    const settlement = computeSettlementRow(
      p,
      prepay.amount,
      paymentAmount,
      playerLoot,
    );
    return {
      ...p,
      settlement: {
        ...settlement,
        prepayment_note: prepay.note || "",
      },
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.gross_due_public += r.settlement.gross_due_public;
      acc.gross_due_organizer += r.settlement.gross_due_organizer;
      acc.paid_total += r.settlement.paid_total;
      acc.debt_public += r.settlement.debt_public;
      acc.debt_organizer += r.settlement.debt_organizer;
      return acc;
    },
    {
      count: 0,
      gross_due_public: 0,
      gross_due_organizer: 0,
      paid_total: 0,
      debt_public: 0,
      debt_organizer: 0,
    },
  );

  return {
    ...billing,
    rows,
    totals,
  };
}

router.get("/:id/billing", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const data = await loadBillingContext(gid);
    if (!data) return res.status(404).json({ error: "Game not found" });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/billing/:playerId", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const playerId = parseInt(req.params.playerId, 10);
    if (!gid || !playerId) {
      return res.status(400).json({ error: "Invalid game or player id" });
    }

    const reg = await q1(
      "SELECT id, attendance FROM game_players WHERE game_id=? AND player_id=?",
      [gid, playerId],
    );
    if (
      !reg ||
      (reg.attendance !== "checked_in" && reg.attendance !== "left_early")
    ) {
      return res.status(400).json({
        error: "Player did not participate in this game (needs check-in or left-early status)",
      });
    }

    const parsed = {};
    for (const key of CATEGORIES) {
      parsed[key] = parseCategoryPayload(req.body || {}, key);
    }

    await ins(
      `INSERT INTO game_player_billing
        (game_id, player_id,
         extra_weapon_mode, extra_weapon_amount, extra_weapon_qty, extra_weapon_unit_price,
         bb_mode, bb_amount, bb_qty, bb_unit_price,
         grenade_mode, grenade_amount, grenade_qty, grenade_unit_price,
         smoke_mode, smoke_amount, smoke_qty, smoke_unit_price,
         mini_bar_mode, mini_bar_amount, mini_bar_qty, mini_bar_unit_price,
         repair_mode, repair_amount, repair_qty, repair_unit_price)
       VALUES
        (?,?,?,?,?, ?, ?,?,?, ?, ?,?,?, ?, ?,?,?, ?, ?,?,?, ?, ?,?,?, ?)
       ON DUPLICATE KEY UPDATE
         extra_weapon_mode=VALUES(extra_weapon_mode),
         extra_weapon_amount=VALUES(extra_weapon_amount),
         extra_weapon_qty=VALUES(extra_weapon_qty),
         extra_weapon_unit_price=VALUES(extra_weapon_unit_price),
         bb_mode=VALUES(bb_mode),
         bb_amount=VALUES(bb_amount),
         bb_qty=VALUES(bb_qty),
         bb_unit_price=VALUES(bb_unit_price),
         grenade_mode=VALUES(grenade_mode),
         grenade_amount=VALUES(grenade_amount),
         grenade_qty=VALUES(grenade_qty),
         grenade_unit_price=VALUES(grenade_unit_price),
         smoke_mode=VALUES(smoke_mode),
         smoke_amount=VALUES(smoke_amount),
         smoke_qty=VALUES(smoke_qty),
         smoke_unit_price=VALUES(smoke_unit_price),
         mini_bar_mode=VALUES(mini_bar_mode),
         mini_bar_amount=VALUES(mini_bar_amount),
         mini_bar_qty=VALUES(mini_bar_qty),
         mini_bar_unit_price=VALUES(mini_bar_unit_price),
         repair_mode=VALUES(repair_mode),
         repair_amount=VALUES(repair_amount),
         repair_qty=VALUES(repair_qty),
         repair_unit_price=VALUES(repair_unit_price),
         updated_at=NOW()`,
      [
        gid,
        playerId,
        parsed.extra_weapon.mode,
        parsed.extra_weapon.amount,
        parsed.extra_weapon.qty,
        parsed.extra_weapon.unitPrice,
        parsed.bb.mode,
        parsed.bb.amount,
        parsed.bb.qty,
        parsed.bb.unitPrice,
        parsed.grenade.mode,
        parsed.grenade.amount,
        parsed.grenade.qty,
        parsed.grenade.unitPrice,
        parsed.smoke.mode,
        parsed.smoke.amount,
        parsed.smoke.qty,
        parsed.smoke.unitPrice,
        parsed.mini_bar.mode,
        parsed.mini_bar.amount,
        parsed.mini_bar.qty,
        parsed.mini_bar.unitPrice,
        parsed.repair.mode,
        parsed.repair.amount,
        parsed.repair.qty,
        parsed.repair.unitPrice,
      ],
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/billing/export", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const viewRaw = String(req.query.view || "admin_public").trim();
    const view = viewRaw === "organizer" ? "organizer" : "admin_public";

    // Use the settlement context so the public export reflects loot-based
    // discounts (free game / -50% / -20%) that players applied to this game.
    const settlement = await loadSettlementContext(gid);
    if (!settlement) return res.status(404).json({ error: "Game not found" });
    const data = { game: settlement.game, players: settlement.rows };

    const basePrice = view === "organizer" ? ORGANIZER_BASE_PRICE : PLAYER_BASE_PRICE;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`Гра_${gid}`);
    const headers = [
      "№",
      "Позивний",
      "Загальна сума",
      "Ціна",
      "Доп зброя та спорядження",
      "Кулі",
      "Гранати",
      "Дим",
      "Міні-бар",
      "Ремонт",
    ];
    sheet.addRow(headers);

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF1F2937" },
    };

    let grandTotal = 0;
    data.players.forEach((p, idx) => {
      const c = p.computed.categories;
      // Public view reflects loot discounts applied to this game; the
      // organizer view always uses the fixed per-slot base price.
      const rowBase =
        view === "organizer"
          ? ORGANIZER_BASE_PRICE
          : p.settlement?.base_due_public ?? basePrice;
      const total =
        view === "organizer"
          ? rowBase + p.computed.extras_total
          : p.settlement?.gross_due_public ?? rowBase + p.computed.extras_total;
      grandTotal += total;
      sheet.addRow([
        idx + 1,
        p.player_name,
        total,
        rowBase,
        c.extra_weapon,
        c.bb,
        c.grenade,
        c.smoke,
        c.mini_bar,
        c.repair,
      ]);
    });

    if (view === "organizer") {
      const totalLabelRow = sheet.addRow([
        "",
        "ЗАГАЛОМ",
        grandTotal,
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]);
      totalLabelRow.font = { bold: true };
      totalLabelRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF3F4F6" },
      };
    }

    sheet.columns = [
      { width: 6 },
      { width: 28 },
      { width: 16 },
      { width: 10 },
      { width: 22 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
    ];
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    const rowCount = sheet.rowCount;
    for (let i = 1; i <= rowCount; i += 1) {
      const row = sheet.getRow(i);
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCBD5E1" } },
          left: { style: "thin", color: { argb: "FFCBD5E1" } },
          bottom: { style: "thin", color: { argb: "FFCBD5E1" } },
          right: { style: "thin", color: { argb: "FFCBD5E1" } },
        };
      });
      if (i > 1) {
        row.getCell(1).alignment = { horizontal: "center" };
        row.getCell(3).alignment = { horizontal: "right" };
        row.getCell(4).alignment = { horizontal: "right" };
      }
    }

    const fileName = view === "organizer"
      ? `organizer_settlement_game_${gid}.xlsx`
      : `player_payment_list_game_${gid}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/settlements", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const settlement = await loadSettlementContext(gid);
    if (!settlement) return res.status(404).json({ error: "Game not found" });
    res.json(settlement);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/unpaid", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const settlement = await loadSettlementContext(gid);
    if (!settlement) return res.status(404).json({ error: "Game not found" });
    const rows = settlement.rows.filter((r) => r.settlement.debt_public > 0);
    const totals = rows.reduce(
      (acc, r) => {
        acc.count += 1;
        acc.gross_due_public += r.settlement.gross_due_public;
        acc.gross_due_organizer += r.settlement.gross_due_organizer;
        acc.paid_total += r.settlement.paid_total;
        acc.debt_public += r.settlement.debt_public;
        acc.debt_organizer += r.settlement.debt_organizer;
        return acc;
      },
      {
        count: 0,
        gross_due_public: 0,
        gross_due_organizer: 0,
        paid_total: 0,
        debt_public: 0,
        debt_organizer: 0,
      },
    );
    res.json({ game: settlement.game, rows, count: rows.length, totals });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/prepayments/:playerId", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const playerId = parseInt(req.params.playerId, 10);
    if (!gid || !playerId) {
      return res.status(400).json({ error: "Invalid game or player id" });
    }

    const reg = await q1(
      "SELECT attendance FROM game_players WHERE game_id=? AND player_id=?",
      [gid, playerId],
    );
    if (!reg || reg.attendance === "no_show") {
      return res.status(400).json({ error: "Player is not eligible for prepayment in this game" });
    }

    const amount = parseMoneyAmount(req.body?.amount);
    const note = String(req.body?.note || "").trim() || null;
    const actorId = req.player?.id || null;

    await ins(
      `INSERT INTO game_player_prepayments (game_id, player_id, amount, note, created_by_player_id)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         amount=VALUES(amount),
         note=VALUES(note),
         created_by_player_id=VALUES(created_by_player_id),
         updated_at=NOW()`,
      [gid, playerId, amount, note, actorId],
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/payments/:playerId/mark-paid", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const playerId = parseInt(req.params.playerId, 10);
    if (!gid || !playerId) {
      return res.status(400).json({ error: "Invalid game or player id" });
    }

    const settlement = await loadSettlementContext(gid);
    if (!settlement) return res.status(404).json({ error: "Game not found" });
    const target = settlement.rows.find((r) => r.player_id === playerId);
    if (!target) return res.status(404).json({ error: "Player not found in checked-in list" });

    const requestedAmount = req.body?.amount;
    let amount = parseMoneyAmount(requestedAmount);
    if (requestedAmount === undefined || requestedAmount === null || requestedAmount === "") {
      amount = target.settlement.debt_public;
    }
    if (amount <= 0) {
      return res.status(400).json({ error: "Nothing to mark as paid" });
    }

    const note = String(req.body?.note || "").trim() || null;
    const actorId = req.player?.id || null;
    await ins(
      `INSERT INTO game_player_payment_events
        (game_id, player_id, amount, event_type, note, created_by_player_id)
       VALUES (?,?,?,?,?,?)`,
      [gid, playerId, amount, "payment", note, actorId],
    );

    res.json({ success: true, amount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/notify-payment/:playerId", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const playerId = parseInt(req.params.playerId, 10);
    if (!gid || !playerId) {
      return res.status(400).json({ error: "Invalid game or player id" });
    }
    const settlement = await loadSettlementContext(gid);
    if (!settlement) return res.status(404).json({ error: "Game not found" });
    const row = settlement.rows.find((r) => r.player_id === playerId);
    if (!row) return res.status(404).json({ error: "Player not found in checked-in list" });
    if (!row.telegram_id) {
      return res.status(400).json({ error: "Player has no telegram_id for direct message" });
    }

    const card = config.PAYMENT_CARD_NUMBER || "картка не вказана";
    const msg = `💳 Розрахунок за гру #${settlement.game.id}

👤 ${row.player_name}
📅 ${settlement.game.date || "—"} ${settlement.game.time || ""}
📍 ${settlement.game.location || "—"}

База: ${row.settlement.base_due_public} грн
Допи: ${row.settlement.extras_due} грн
Разом: ${row.settlement.gross_due_public} грн
Сплачено: ${row.settlement.paid_total} грн
До сплати: ${row.settlement.debt_public} грн

Картка: ${card}`;

    await bot.api.sendMessage(row.telegram_id, msg);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/notify-payment", adminMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const settlement = await loadSettlementContext(gid);
    if (!settlement) return res.status(404).json({ error: "Game not found" });
    const card = config.PAYMENT_CARD_NUMBER || "картка не вказана";

    let sent = 0;
    const skipped = [];
    for (const row of settlement.rows) {
      if (row.settlement.debt_public <= 0) continue;
      if (!row.telegram_id) {
        skipped.push({ player_id: row.player_id, reason: "no_telegram_id" });
        continue;
      }
      const msg = `💳 Розрахунок за гру #${settlement.game.id}

👤 ${row.player_name}
📅 ${settlement.game.date || "—"} ${settlement.game.time || ""}
📍 ${settlement.game.location || "—"}

База: ${row.settlement.base_due_public} грн
Допи: ${row.settlement.extras_due} грн
Разом: ${row.settlement.gross_due_public} грн
Сплачено: ${row.settlement.paid_total} грн
До сплати: ${row.settlement.debt_public} грн

Картка: ${card}`;
      await bot.api.sendMessage(row.telegram_id, msg);
      sent += 1;
    }
    res.json({ success: true, sent, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get("/:id/my-settlement", async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const playerId = Number(req.player?.id || 0);
    if (!gid || !playerId) {
      return res.status(400).json({ error: "Invalid game or player id" });
    }

    const settlement = await loadSettlementContext(gid);
    if (!settlement) return res.status(404).json({ error: "Game not found" });

    const row = settlement.rows.find((r) => Number(r.player_id) === playerId);
    if (!row) {
      return res.status(404).json({ error: "Settlement is available only for your own participation" });
    }

    res.json({
      game: settlement.game,
      player_id: row.player_id,
      player_name: row.player_name,
      settlement: row.settlement,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
