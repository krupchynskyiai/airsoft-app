const { Router } = require("express");
const { q1 } = require("../../database/helpers");
const { getDB } = require("../../database/connection");

const router = Router();

const SURVEY_KEY = "game-experience-2026-v1";
const OVERALL_VALUES = ["great", "ok", "meh", "bad"];
const LIKES_VALUES = [
  "atmosphere",
  "community",
  "organization",
  "formats",
  "location",
  "gameplay",
  "other",
];
const IMPROVEMENT_VALUES = [
  "team_balance",
  "rules_clarity",
  "refereeing",
  "pace",
  "respawns_mechanics",
  "other",
];
const APP_HELP_VALUES = ["helps_a_lot", "rather_yes", "rather_no", "not_needed"];

function normalizeArray(input, allowed) {
  if (!Array.isArray(input)) return [];
  return Array.from(
    new Set(
      input
        .map((x) => String(x || "").trim())
        .filter((x) => allowed.includes(x)),
    ),
  );
}

function safeText(v, maxLen = 2000) {
  const s = String(v || "").trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

router.get("/status", async (req, res) => {
  try {
    const playerId = req.player?.id;
    if (!playerId) return res.status(400).json({ error: "Not registered" });

    const row = await q1(
      `SELECT id, created_at
       FROM player_feedback_surveys
       WHERE player_id=? AND survey_key=?
       LIMIT 1`,
      [playerId, SURVEY_KEY],
    );

    res.json({
      survey_key: SURVEY_KEY,
      submitted: !!row,
      submitted_at: row?.created_at || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/submit", async (req, res) => {
  const conn = await getDB().getConnection();
  try {
    const playerId = req.player?.id;
    if (!playerId) {
      return res.status(400).json({ error: "Not registered" });
    }

    const body = req.body || {};
    const overall = String(body.overall_experience || "").trim();
    const appHelp = String(body.app_helpfulness || "").trim();
    const likes = normalizeArray(body.likes, LIKES_VALUES);
    const improvements = normalizeArray(body.improvements, IMPROVEMENT_VALUES);
    const painPoints = safeText(body.pain_points, 4000);
    const missingFeature = safeText(body.missing_feature, 4000);

    if (!OVERALL_VALUES.includes(overall)) {
      return res.status(400).json({ error: "Invalid overall_experience value" });
    }
    if (!APP_HELP_VALUES.includes(appHelp)) {
      return res.status(400).json({ error: "Invalid app_helpfulness value" });
    }

    await conn.beginTransaction();

    const [existingRows] = await conn.execute(
      `SELECT id
       FROM player_feedback_surveys
       WHERE player_id=? AND survey_key=?
       FOR UPDATE`,
      [playerId, SURVEY_KEY],
    );
    const hadSubmission = !!existingRows[0];

    if (!hadSubmission) {
      await conn.execute(
        `INSERT INTO player_feedback_surveys
          (player_id, survey_key, overall_experience, likes_json, pain_points, improvements_json, app_helpfulness, missing_feature)
         VALUES (?,?,?,?,?,?,?,?)`,
        [
          playerId,
          SURVEY_KEY,
          overall,
          JSON.stringify(likes),
          painPoints,
          JSON.stringify(improvements),
          appHelp,
          missingFeature,
        ],
      );
    } else {
      await conn.execute(
        `UPDATE player_feedback_surveys
         SET overall_experience=?,
             likes_json=?,
             pain_points=?,
             improvements_json=?,
             app_helpfulness=?,
             missing_feature=?,
             updated_at=NOW()
         WHERE player_id=? AND survey_key=?`,
        [
          overall,
          JSON.stringify(likes),
          painPoints,
          JSON.stringify(improvements),
          appHelp,
          missingFeature,
          playerId,
          SURVEY_KEY,
        ],
      );
    }

    let bonusSpinGranted = false;
    if (!hadSubmission) {
      const [playerRows] = await conn.execute(
        "SELECT rating FROM players WHERE id=? FOR UPDATE",
        [playerId],
      );
      const rating = Number(playerRows[0]?.rating || 0);
      const formulaSpins = Math.floor(rating / 50);

      const [spinRows] = await conn.execute(
        "SELECT total_spins_earned, spins_used, free_spin_granted FROM player_spins WHERE player_id=? FOR UPDATE",
        [playerId],
      );
      const ps = spinRows[0];

      if (!ps) {
        await conn.execute(
          `INSERT INTO player_spins
            (player_id, total_spins_earned, spins_used, free_spin_granted)
           VALUES (?,?,0,1)`,
          [playerId, formulaSpins + 2], // formula + base free + survey bonus
        );
      } else {
        const hadFree = !!ps.free_spin_granted;
        const baseline = formulaSpins + (hadFree ? 1 : 0);
        const normalizedCurrent = Math.max(
          Number(ps.total_spins_earned || 0),
          hadFree ? baseline : formulaSpins + 1,
        );
        const newTotal = normalizedCurrent + 1; // one-time survey bonus spin

        await conn.execute(
          `UPDATE player_spins
           SET total_spins_earned=?,
               free_spin_granted=1
           WHERE player_id=?`,
          [newTotal, playerId],
        );
      }
      bonusSpinGranted = true;
    }

    await conn.commit();
    res.json({ success: true, bonus_spin_granted: bonusSpinGranted });
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

module.exports = router;
