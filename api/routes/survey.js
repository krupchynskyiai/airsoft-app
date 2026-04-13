const { Router } = require("express");
const { q1, ins } = require("../../database/helpers");

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
  try {
    const playerId = req.player?.id;
    if (!playerId) return res.status(400).json({ error: "Not registered" });

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

    await ins(
      `INSERT INTO player_feedback_surveys
        (player_id, survey_key, overall_experience, likes_json, pain_points, improvements_json, app_helpfulness, missing_feature)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         overall_experience=VALUES(overall_experience),
         likes_json=VALUES(likes_json),
         pain_points=VALUES(pain_points),
         improvements_json=VALUES(improvements_json),
         app_helpfulness=VALUES(app_helpfulness),
         missing_feature=VALUES(missing_feature),
         updated_at=NOW()`,
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

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
