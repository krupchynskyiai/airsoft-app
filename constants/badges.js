const BADGES = [
  // ---------- Ігри (активність) ----------
  { name: "Recruit", icon: "Users", color: "#94a3b8", description: "Зіграти принаймні одну гру в клубі.", check: (s) => s.games_played >= 1 },
  { name: "Initiate", icon: "Sparkles", color: "#38bdf8", description: "Мінімум 3 завершені ігри — ти в темі.", check: (s) => s.games_played >= 3 },
  { name: "Veteran", icon: "Medal", color: "#f59e0b", description: "10+ ігор: сталий учасник полігонів.", check: (s) => s.games_played >= 10 },
  { name: "Iron Will", icon: "TrendingUp", color: "#cbd5e1", description: "25 ігор без зникнень з календаря.", check: (s) => s.games_played >= 25 },
  { name: "War Machine", icon: "Rocket", color: "#f97316", description: "50 ігор — серйозна посадкова дисципліна.", check: (s) => s.games_played >= 50 },
  { name: "Centurion", icon: "Hash", color: "#fbbf24", description: "100 ігор: рідкісний рівень активності.", check: (s) => s.games_played >= 100 },
  { name: "Marathon", icon: "Mountain", color: "#64748b", description: "200 ігор — легенда присутності.", check: (s) => s.games_played >= 200 },

  // ---------- Перемоги ----------
  { name: "First Blood", icon: "Crosshair", color: "#ef4444", description: "Перша перемога в підсумку гри (твоя команда виграла матч).", check: (s) => s.wins >= 1 },
  { name: "Double Down", icon: "Target", color: "#fb7185", description: "Щонайменше 2 перемоги в матчах.", check: (s) => s.wins >= 2 },
  { name: "Triple Play", icon: "Zap", color: "#f43f5e", description: "3+ перемоги за підсумками ігор.", check: (s) => s.wins >= 3 },
  { name: "Champion", icon: "Trophy", color: "#10b981", description: "5 перемог — стабільно потрапляєш у виграшні команди.", check: (s) => s.wins >= 5 },
  { name: "Battle Tested", icon: "Flame", color: "#ea580c", description: "10 перемог у клубному обліку.", check: (s) => s.wins >= 10 },
  { name: "Legend", icon: "Crown", color: "#8b5cf6", description: "25 перемог.", check: (s) => s.wins >= 25 },
  { name: "Grandmaster", icon: "PartyPopper", color: "#6366f1", description: "50 перемог.", check: (s) => s.wins >= 50 },

  // ---------- MVP ----------
  { name: "MVP Spark", icon: "Star", color: "#fde047", description: "Хоча б раз обраний MVP раунду голосуванням переможців.", check: (s) => s.mvp_count >= 1 },
  { name: "MVP Star", icon: "Award", color: "#eab308", description: "3+ відзнак MVP за раунди.", check: (s) => s.mvp_count >= 3 },
  { name: "MVP Core", icon: "BadgeCheck", color: "#facc15", description: "5+ MVP — ключова фігура в команді.", check: (s) => s.mvp_count >= 5 },
  { name: "MVP Icon", icon: "Flag", color: "#ca8a04", description: "10+ MVP.", check: (s) => s.mvp_count >= 10 },
  { name: "MVP Titan", icon: "Heart", color: "#a16207", description: "20+ MVP.", check: (s) => s.mvp_count >= 20 },

  // ---------- Рейтинг (сума очок) ----------
  { name: "Rookie Rank", icon: "CircleDot", color: "#86efac", description: "Сума рейтингу в клубі досягла 20.", check: (s) => s.rating >= 20 },
  { name: "Soldier", icon: "Hexagon", color: "#4ade80", description: "Рейтинг 50+.", check: (s) => s.rating >= 50 },
  { name: "Officer", icon: "ClipboardList", color: "#22c55e", description: "Рейтинг 100+.", check: (s) => s.rating >= 100 },
  { name: "Commander", icon: "Gauge", color: "#16a34a", description: "Рейтинг 200+.", check: (s) => s.rating >= 200 },
  { name: "Elite", icon: "Gem", color: "#06b6d4", description: "Рейтинг 350+.", check: (s) => s.rating >= 350 },
  { name: "Apex", icon: "Sun", color: "#7c3aed", description: "Рейтинг 550+.", check: (s) => s.rating >= 550 },

  // ---------- Виживання / стиль гри ----------
  { name: "Survivor", icon: "Shield", color: "#22c55e", description: "10+ ігор і в середньому не більше однієї смерті на гру в обліку клубу.", check: (s) => s.games_played >= 10 && s.total_deaths <= s.games_played },
  { name: "Immortal", icon: "Skull", color: "#a855f7", description: "20+ ігор і смертей не більше половини від кількості ігор.", check: (s) => s.games_played >= 20 && s.total_deaths <= s.games_played * 0.5 },
  { name: "Ghost", icon: "Moon", color: "#6b7280", description: "20+ ігор і дуже мало смертей відносно ігор (стиль «привид»).", check: (s) => s.games_played >= 20 && s.total_deaths <= Math.floor(s.games_played * 0.2) },
  { name: "Berserker", icon: "Swords", color: "#dc2626", description: "10+ ігор і смертей удвічі більше за кількість ігор — агресивний стиль.", check: (s) => s.games_played >= 10 && s.total_deaths >= s.games_played * 2 },
  { name: "Обмежено придатний", icon: "Moon", emoji: "🦿", color: "#93c5fd", description: "Бо треба берпі робити", check: (s) => Number(s.id) === 3 || Number(s.telegram_id) === 391102960 || String(s.telegram_username || "").toLowerCase() === "andrewuz" },

  // ---------- Убивства (якщо поле оновлюється в БД) ----------
  // { name: "Sharpshooter", icon: "Target", color: "#0ea5e9", check: (s) => (s.total_kills || 0) >= 30 },
];

module.exports = BADGES;
