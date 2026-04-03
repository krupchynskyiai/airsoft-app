const { Router } = require("express");
const { q, q1, ins } = require("../../database/helpers");
const log = require("../../utils/logger");
const { RARITIES, LOOT_REWARDS } = require("../../constants/lootRewards");
const { loadPlayerByTelegram } = require("../middleware/auth");

const router = Router();

async function getPlayerFromReq(req) {
  const tgId = req.tgUser?.id;
  if (!tgId) throw new Error("No Telegram user");
  const base = await loadPlayerByTelegram(req.tgUser);
  if (!base?.id) throw new Error("Player not registered");
  return base;
}

async function getSpinState(playerId) {
  const p = await q1("SELECT rating FROM players WHERE id=?", [playerId]);
  const rating = p?.rating || 0;
  const formulaSpins = Math.floor(rating / 50); // 1 спін за кожні 50 рейтингу

  let ps = await q1(
    "SELECT * FROM player_spins WHERE player_id=?",
    [playerId],
  );

  if (!ps) {
    // Перше створення: формула + 1 безкоштовний спін
    const totalEarned = formulaSpins + 1;
    await ins(
      "INSERT INTO player_spins (player_id,total_spins_earned,spins_used,free_spin_granted) VALUES (?,?,0,1)",
      [playerId, totalEarned],
    );
    ps = {
      player_id: playerId,
      total_spins_earned: totalEarned,
      spins_used: 0,
      free_spin_granted: 1,
    };
  } else {
    let totalEarned = formulaSpins + (ps.free_spin_granted ? 1 : 0);
    let needUpdate = false;

    if (!ps.free_spin_granted) {
      ps.free_spin_granted = 1;
      totalEarned += 1;
      needUpdate = true;
    }
    if (totalEarned > ps.total_spins_earned) {
      ps.total_spins_earned = totalEarned;
      needUpdate = true;
    }

    if (needUpdate) {
      await ins(
        "UPDATE player_spins SET total_spins_earned=?, free_spin_granted=? WHERE player_id=?",
        [ps.total_spins_earned, ps.free_spin_granted, playerId],
      );
    }
  }

  const totalSpins = ps.total_spins_earned;
  const usedSpins = ps.spins_used || 0;
  const remainingSpins = Math.max(0, totalSpins - usedSpins);

  return { rating, totalSpins, usedSpins, remainingSpins };
}

function pickRandomReward() {
  const enabledRewards = LOOT_REWARDS.filter((r) => r.enabled);
  if (!enabledRewards.length) throw new Error("No rewards enabled");

  const rarityKeys = Object.keys(RARITIES);
  const totalBase = rarityKeys.reduce(
    (sum, k) => sum + (RARITIES[k].baseChance || 0),
    0,
  );
  let r = Math.random() * totalBase;
  let chosenRarity = rarityKeys[0];
  for (const key of rarityKeys) {
    const c = RARITIES[key].baseChance || 0;
    if (r < c) {
      chosenRarity = key;
      break;
    }
    r -= c;
  }

  const pool = enabledRewards.filter((rw) => rw.rarity === chosenRarity);
  if (!pool.length) {
    return enabledRewards[Math.floor(Math.random() * enabledRewards.length)];
  }

  const totalWeight = pool.reduce((sum, rw) => sum + (rw.weight || 1), 0);
  let x = Math.random() * totalWeight;
  for (const rw of pool) {
    const w = rw.weight || 1;
    if (x < w) return rw;
    x -= w;
  }
  return pool[pool.length - 1];
}

// GET /api/loot/state
router.get("/state", async (req, res) => {
  try {
    const player = await getPlayerFromReq(req);
    const state = await getSpinState(player.id);

    const rewards = await q(
      "SELECT id, reward_key, rarity, image_url, status, source, created_at FROM player_loot_rewards WHERE player_id=? ORDER BY created_at DESC LIMIT 50",
      [player.id],
    );

    const catalog = LOOT_REWARDS.filter((r) => r.enabled).map((r) => ({
      reward_key: r.key,
      title: r.title,
      description: r.description,
      rarity: r.rarity,
      image_url: r.imageUrl,
    }));

    res.json({
      ...state,
      rewards,
      rarities: RARITIES,
      catalog,
    });
  } catch (e) {
    log.error("Loot state error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/loot/spin
router.post("/spin", async (req, res) => {
  try {
    const player = await getPlayerFromReq(req);
    const stateBefore = await getSpinState(player.id);

    if (stateBefore.remainingSpins <= 0) {
      return res
        .status(400)
        .json({ error: "Немає доступних обертів (набирай рейтинг щоб отримати нові)." });
    }

    const reward = pickRandomReward();

    // Позначаємо, що спін використано
    await ins(
      "UPDATE player_spins SET spins_used=spins_used+1 WHERE player_id=?",
      [player.id],
    );

    const r = await ins(
      "INSERT INTO player_loot_rewards (player_id,reward_key,rarity,image_url,status,source) VALUES (?,?,?,?, 'active','spin')",
      [
        player.id,
        reward.key,
        reward.rarity,
        reward.imageUrl,
      ],
    );

    const nextState = await getSpinState(player.id);

    res.json({
      success: true,
      reward: {
        id: r.insertId,
        key: reward.key,
        title: reward.title,
        description: reward.description,
        rarity: reward.rarity,
        color: RARITIES[reward.rarity]?.color || null,
        image_url: reward.imageUrl,
      },
      state: nextState,
    });
  } catch (e) {
    log.error("Loot spin error", { error: e.message });
    res.status(500).json({ error: e.message });
  }
});

// POST /api/loot/rewards/:id/request-use
// Гравець лише подає запит, а списання бонуса робить адмін.
router.post("/rewards/:id/request-use", async (req, res) => {
  try {
    const player = await getPlayerFromReq(req);
    const rewardId = parseInt(req.params.id, 10);

    if (!rewardId) {
      return res.status(400).json({ error: "Invalid reward id" });
    }

    const row = await q1(
      "SELECT id, player_id, status, source, reward_key FROM player_loot_rewards WHERE id=?",
      [rewardId],
    );

    if (!row) {
      return res.status(404).json({ error: "Reward not found" });
    }
    if (row.player_id !== player.id) {
      return res.status(403).json({ error: "This reward does not belong to you" });
    }
    if (row.status !== "active") {
      return res.status(400).json({ error: "Цей бонус вже використано." });
    }
    if (row.source === "use_requested") {
      return res.status(400).json({ error: "Запит вже надіслано. Очікуйте підтвердження адміна." });
    }

    const upd = await ins(
      "UPDATE player_loot_rewards SET source='use_requested', updated_at=NOW() WHERE id=? AND player_id=? AND status='active'",
      [rewardId, player.id],
    );
    if (!upd?.affectedRows) {
      return res.status(400).json({ error: "Не вдалося створити запит." });
    }

    log.info("Loot use requested", {
      rewardId,
      playerId: player.id,
      rewardKey: row.reward_key,
    });

    return res.json({ success: true, reward_id: rewardId, source: "use_requested" });
  } catch (e) {
    log.error("Loot request use error", { error: e.message });
    return res.status(500).json({ error: e.message });
  }
});

module.exports = router;

