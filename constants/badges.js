const BADGES = [
    { name: "First Blood", emoji: "🩸", check: (s) => s.wins >= 1 },
    { name: "Veteran", emoji: "🎖", check: (s) => s.games_played >= 10 },
    { name: "Champion", emoji: "🏆", check: (s) => s.wins >= 5 },
    { name: "Legend", emoji: "👑", check: (s) => s.wins >= 25 },
    { name: "War Machine", emoji: "⚙️", check: (s) => s.games_played >= 50 },
    { name: "MVP Star", emoji: "⭐", check: (s) => s.mvp_count >= 3 },
    { name: "Elite", emoji: "💎", check: (s) => s.rating >= 500 },
    { name: "Killer", emoji: "🔫", check: (s) => s.total_kills >= 50 },
    { name: "Sniper", emoji: "🎯", check: (s) => s.total_kills >= 100 },
    { name: "Rambo", emoji: "💪", check: (s) => s.total_kills >= 250 },
  ];
  
  module.exports = BADGES;