const BADGES = [
    { name: "First Blood", icon: "Crosshair", color: "#ef4444", check: (s) => s.wins >= 1 },
    { name: "Veteran", icon: "Medal", color: "#f59e0b", check: (s) => s.games_played >= 10 },
    { name: "Champion", icon: "Trophy", color: "#10b981", check: (s) => s.wins >= 5 },
    { name: "Legend", icon: "Crown", color: "#8b5cf6", check: (s) => s.wins >= 25 },
    { name: "War Machine", icon: "Flame", color: "#f97316", check: (s) => s.games_played >= 50 },
    { name: "MVP Star", icon: "Star", color: "#eab308", check: (s) => s.mvp_count >= 3 },
    { name: "Elite", icon: "Gem", color: "#06b6d4", check: (s) => s.rating >= 500 },
    { name: "Survivor", icon: "Shield", color: "#22c55e", check: (s) => s.games_played >= 10 && s.total_deaths <= s.games_played },
    { name: "Immortal", icon: "Skull", color: "#a855f7", check: (s) => s.games_played >= 20 && s.total_deaths <= s.games_played * 0.5 },
  ];
  
  module.exports = BADGES;