const BADGES = [
  // ---------- Ігри (активність) ----------
  { name: "Recruit", icon: "Users", color: "#94a3b8", check: (s) => s.games_played >= 1 },
  { name: "Initiate", icon: "Sparkles", color: "#38bdf8", check: (s) => s.games_played >= 3 },
  { name: "Veteran", icon: "Medal", color: "#f59e0b", check: (s) => s.games_played >= 10 },
  { name: "Iron Will", icon: "TrendingUp", color: "#cbd5e1", check: (s) => s.games_played >= 25 },
  { name: "War Machine", icon: "Rocket", color: "#f97316", check: (s) => s.games_played >= 50 },
  { name: "Centurion", icon: "Hash", color: "#fbbf24", check: (s) => s.games_played >= 100 },
  { name: "Marathon", icon: "Mountain", color: "#64748b", check: (s) => s.games_played >= 200 },

  // ---------- Перемоги ----------
  { name: "First Blood", icon: "Crosshair", color: "#ef4444", check: (s) => s.wins >= 1 },
  { name: "Double Down", icon: "Target", color: "#fb7185", check: (s) => s.wins >= 2 },
  { name: "Triple Play", icon: "Zap", color: "#f43f5e", check: (s) => s.wins >= 3 },
  { name: "Champion", icon: "Trophy", color: "#10b981", check: (s) => s.wins >= 5 },
  { name: "Battle Tested", icon: "Flame", color: "#ea580c", check: (s) => s.wins >= 10 },
  { name: "Legend", icon: "Crown", color: "#8b5cf6", check: (s) => s.wins >= 25 },
  { name: "Grandmaster", icon: "PartyPopper", color: "#6366f1", check: (s) => s.wins >= 50 },

  // ---------- MVP ----------
  { name: "MVP Spark", icon: "Star", color: "#fde047", check: (s) => s.mvp_count >= 1 },
  { name: "MVP Star", icon: "Award", color: "#eab308", check: (s) => s.mvp_count >= 3 },
  { name: "MVP Core", icon: "BadgeCheck", color: "#facc15", check: (s) => s.mvp_count >= 5 },
  { name: "MVP Icon", icon: "Flag", color: "#ca8a04", check: (s) => s.mvp_count >= 10 },
  { name: "MVP Titan", icon: "Heart", color: "#a16207", check: (s) => s.mvp_count >= 20 },

  // ---------- Рейтинг (сума очок) ----------
  { name: "Rookie Rank", icon: "CircleDot", color: "#86efac", check: (s) => s.rating >= 20 },
  { name: "Soldier", icon: "Hexagon", color: "#4ade80", check: (s) => s.rating >= 50 },
  { name: "Officer", icon: "ClipboardList", color: "#22c55e", check: (s) => s.rating >= 100 },
  { name: "Commander", icon: "Gauge", color: "#16a34a", check: (s) => s.rating >= 200 },
  { name: "Elite", icon: "Gem", color: "#06b6d4", check: (s) => s.rating >= 350 },
  { name: "Apex", icon: "Sun", color: "#7c3aed", check: (s) => s.rating >= 550 },

  // ---------- Виживання / стиль гри ----------
  { name: "Survivor", icon: "Shield", color: "#22c55e", check: (s) => s.games_played >= 10 && s.total_deaths <= s.games_played },
  { name: "Immortal", icon: "Skull", color: "#a855f7", check: (s) => s.games_played >= 20 && s.total_deaths <= s.games_played * 0.5 },
  { name: "Ghost", icon: "Moon", color: "#6b7280", check: (s) => s.games_played >= 20 && s.total_deaths <= Math.floor(s.games_played * 0.2) },
  { name: "Berserker", icon: "Swords", color: "#dc2626", check: (s) => s.games_played >= 10 && s.total_deaths >= s.games_played * 2 },

  // ---------- Убивства (якщо поле оновлюється в БД) ----------
  // { name: "Sharpshooter", icon: "Target", color: "#0ea5e9", check: (s) => (s.total_kills || 0) >= 30 },
];

module.exports = BADGES;
