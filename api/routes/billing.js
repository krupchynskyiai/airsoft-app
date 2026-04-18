const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const { adminOrOrganizerMiddleware } = require("../middleware/auth");
const ExcelJS = require("exceljs");

const router = Router();

const CATEGORIES = [
  "extra_weapon",
  "bb",
  "grenade",
  "smoke",
  "mini_bar",
  "repair",
];

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

async function loadBillingContext(gid) {
  const game = await q1(
    "SELECT id, status, payment FROM games WHERE id=?",
    [gid],
  );
  if (!game) return null;

  const rows = await q(
    `SELECT
        gp.player_id,
        COALESCE(p.callsign, p.nickname) AS player_name,
        p.telegram_username,
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
    },
    players,
  };
}

router.get("/:id/billing", adminOrOrganizerMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const data = await loadBillingContext(gid);
    if (!data) return res.status(404).json({ error: "Game not found" });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/:id/billing/:playerId", adminOrOrganizerMiddleware, async (req, res) => {
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

router.get("/:id/billing/export", adminOrOrganizerMiddleware, async (req, res) => {
  try {
    const gid = parseInt(req.params.id, 10);
    const view = String(req.query.view || "admin").trim() === "organizer"
      ? "organizer"
      : "admin";
    const basePrice = view === "organizer" ? 500 : 700;

    const data = await loadBillingContext(gid);
    if (!data) return res.status(404).json({ error: "Game not found" });

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

    const fileName = `game_${gid}_billing_${view}.xlsx`;
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

module.exports = router;
