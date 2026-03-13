import React, { useState, useEffect } from "react";
import { getGames } from "../api";
import { useTelegram } from "../hooks/useTelegram";

const MODE = { team_vs_team: "⚔️ TvT", random_teams: "🎲 Random", ffa: "👤 FFA" };

const STATUS_CONFIG = {
  upcoming: { gradient: "from-blue-600/20 to-blue-800/10", border: "border-blue-700/30", badge: "bg-blue-500/20 text-blue-300", label: "Очікується", dot: "bg-blue-400" },
  checkin: { gradient: "from-amber-600/20 to-amber-800/10", border: "border-amber-700/30", badge: "bg-amber-500/20 text-amber-300", label: "Check-in", dot: "bg-amber-400 animate-pulse" },
  active: { gradient: "from-red-600/20 to-red-800/10", border: "border-red-700/30", badge: "bg-red-500/20 text-red-300", label: "LIVE", dot: "bg-red-400 animate-pulse" },
  finished: { gradient: "from-slate-600/10 to-slate-800/10", border: "border-slate-700/30", badge: "bg-slate-600/30 text-gray-400", label: "Завершена", dot: "bg-gray-500" },
  cancelled: { gradient: "from-slate-800/20 to-slate-900/10", border: "border-slate-800/30", badge: "bg-slate-700/30 text-gray-500", label: "Скасована", dot: "bg-gray-600" },
};

export default function Games({ onOpenGame }) {
  const [games, setGames] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const { haptic } = useTelegram();

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const data = await getGames(filter === "all" ? undefined : filter);
      setGames(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const filters = [
    { id: "all", label: "Всі", icon: "📋" },
    { id: "upcoming", label: "Скоро", icon: "⏳" },
    { id: "active", label: "Live", icon: "🔴" },
    { id: "finished", label: "Архів", icon: "✅" },
  ];

  const activeCount = games.filter((g) => g.status === "active").length;

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-2xl font-black">Ігри</h2>
          <p className="text-sm text-gray-500">{games.length} подій</p>
        </div>
        {activeCount > 0 && (
          <div className="flex items-center gap-2 bg-red-500/15 border border-red-500/20 px-3 py-1.5 rounded-full">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="text-xs font-bold text-red-400">{activeCount} LIVE</span>
          </div>
        )}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => { haptic("impact"); setFilter(f.id); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-sm font-semibold whitespace-nowrap transition-all duration-200 active:scale-95 ${
              filter === f.id
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-900/20"
                : "bg-slate-800/60 text-gray-400 border border-slate-700/30"
            }`}
          >
            <span className="text-sm">{f.icon}</span>
            {f.label}
          </button>
        ))}
      </div>

      {/* Games list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800/50 rounded-2xl p-5 animate-pulse">
              <div className="h-4 bg-slate-700 rounded w-1/3 mb-3" />
              <div className="h-3 bg-slate-700 rounded w-2/3 mb-2" />
              <div className="h-3 bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🎯</div>
          <p className="text-gray-400 font-medium">Немає ігор</p>
          <p className="text-gray-600 text-sm mt-1">Поки що тут порожньо</p>
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((g, idx) => {
            const st = STATUS_CONFIG[g.status] || STATUS_CONFIG.upcoming;
            return (
              <button
                key={g.id}
                onClick={() => { haptic("impact"); onOpenGame(g.id); }}
                className={`w-full text-left bg-gradient-to-br ${st.gradient} rounded-2xl p-4 border ${st.border} hover:border-slate-500/50 transition-all duration-200 active:scale-[0.98]`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                {/* Top row */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm font-mono">#{g.id}</span>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold ${st.badge}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${st.dot}`} />
                      {st.label}
                    </div>
                  </div>
                  <span className="text-xs bg-slate-700/60 px-2.5 py-1 rounded-lg font-semibold text-gray-300">
                    {MODE[g.game_mode] || g.game_mode}
                  </span>
                </div>

                {/* Date & location */}
                <div className="mb-3">
                  <div className="font-bold text-[15px] mb-0.5">
                    📅 {g.date} {g.time && <span className="text-gray-400 font-normal">о {g.time}</span>}
                  </div>
                  <div className="text-sm text-gray-400 flex items-center gap-1">
                    📍 {g.location}
                  </div>
                  {g.duration && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      ⏱ Тривалість: <span className="font-medium text-gray-300">{g.duration}</span>
                    </div>
                  )}
                </div>

                {/* Bottom stats */}
                <div className="flex items-center justify-between">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1.5 text-sm text-gray-400">
                        <span className="text-base">👥</span>
                        <span className="font-semibold text-gray-300">{g.player_count}</span>
                        <span className="text-gray-500">гравців</span>
                      </div>
                      {typeof g.payment === "number" && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-400">
                          <span className="text-base">🪙</span>
                          <span className="font-semibold text-gray-300">{g.payment}</span>
                          <span className="text-gray-500">грн</span>
                        </div>
                      )}
                    </div>
                    {Array.isArray(g.friends_in_game) && g.friends_in_game.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-300">
                        <span>🤝</span>
                        <span className="truncate">
                          Друзі: {g.friends_in_game.join(", ")}
                        </span>
                      </div>
                    )}
                  </div>
                  {g.current_round > 0 && (
                    <div className="flex items-center gap-1.5 text-sm text-gray-400">
                      <span className="text-base">🔄</span>
                      <span>Раунд {g.current_round}</span>
                    </div>
                  )}
                </div>

              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes liveBar { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        .animate-live-bar { animation: liveBar 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}