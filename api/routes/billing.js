const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const { adminMiddleware } = require("../middleware/auth");
const ExcelJS = require("exceljs");
const config = require("../../config");
const bot = require("../bot");

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

function computeSettlementRow(playerRow, prepaymentAmount, paymentEventAmount) {
  const extrasDue = Number(playerRow?.computed?.extras_total || 0);
  const prepayment = Number(prepaymentAmount || 0);
  const payments = Number(paymentEventAmount || 0);
  const paidTotal = prepayment + payments;

  const grossPublic = PLAYER_BASE_PRICE + extrasDue;
  const grossOrganizer = ORGANIZER_BASE_PRICE + extrasDue;

  const debtPublic = Math.max(0, grossPublic - paidTotal);
  const debtOrganizer = Math.max(0, grossOrganizer - paidTotal);

  return {
    extras_due: extrasDue,
    base_due_public: PLAYER_BASE_PRICE,
    base_due_organizer: ORGANIZER_BASE_PRICE,
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

  const rows = await q(
    `SELECT
        gp.player_id,
        COALESCE(p.callsign, p.nickname) AS player_name,
        p.telegram_username,
        p.telegram_id,
        gp.attendance,
        b.*
     FROM game_players gp
     JOIN players p ON p.id = gp.player_id
     LEFT JOIN game_player_billing b
       ON b.game_id = gp.game_id AND b.player_id = gp.player_id
     WHERE gp.game_id=? AND gp.attendance='checked_in'
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

  const prepayMap = new Map(
    prepayments.map((r) => [Number(r.player_id), { amount: Number(r.amount || 0), note: r.note || "" }]),
  );
  const eventMap = new Map(
    paymentEvents.map((r) => [Number(r.player_id), Number(r.total_amount || 0)]),
  );

  const rows = billing.players.map((p) => {
    const prepay = prepayMap.get(Number(p.player_id)) || { amount: 0, note: "" };
    const paymentAmount = eventMap.get(Number(p.player_id)) || 0;
    const settlement = computeSettlementRow(p, prepay.amount, paymentAmount);
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
    if (!reg || reg.attendance !== "checked_in") {
      return res.status(400).json({ error: "Player is not checked-in for this game" });
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

    const data = await loadBillingContext(gid);
    if (!data) return res.status(404).json({ error: "Game not found" });

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
      const total = basePrice + p.computed.extras_total;
      grandTotal += total;
      sheet.addRow([
        idx + 1,
        p.player_name,
        total,
        basePrice,
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
    if (!reg || reg.attendance !== "checked_in") {
      return res.status(400).json({ error: "Player is not checked-in for this game" });
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
