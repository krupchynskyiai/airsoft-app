const BADGES = [
    { name: "First Blood", emoji: "🩸", check: (s) => s.wins >= 1 },
    { name: "Veteran", emoji: "🎖", check: (s) => s.games_played >= 10 },
    { name: "Champion", emoji: "🏆", check: (s) => s.wins >= 5 },
    { name: "Legend", emoji: "👑", check: (s) => s.wins >= 25 },
    { name: "War Machine", emoji: "⚙️", check: (s) => s.games_played >= 50 },
    { name: "MVP Star", emoji: "⭐", check: (s) => s.mvp_count >= 3 },
    { name: "Elite", emoji: "💎", check: (s) => s.rating >= 500 },
    { name: "Survivor", emoji: "🛡", check: (s) => s.games_played >= 10 && s.total_deaths <= s.games_played },
    { name: "Immortal", emoji: "👑", check: (s) => s.games_played >= 20 && s.total_deaths <= s.games_played * 0.5 },
  ];
  
  module.exports = BADGES;