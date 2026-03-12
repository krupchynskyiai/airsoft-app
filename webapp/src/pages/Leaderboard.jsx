import React, { useState, useEffect } from "react";
import { getLeaderboard, getTeamsLeaderboard, getSeasonStats } from "../api";
import { useTelegram } from "../hooks/useTelegram";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Leaderboard() {
  const [tab, setTab] = useState("players");
  const [players, setPlayers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const { haptic } = useTelegram();

  useEffect(() => { load(); }, [tab]);

  async function load() {
    setLoading(true);
    try {
      if (tab === "players") setPlayers(await getLeaderboard());
      if (tab === "teams") setTeams(await getTeamsLeaderboard());
      if (tab === "season") setSeason(await getSeasonStats());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const tabs = [
    { id: "players", label: "Гравці", icon: "👤" },
    { id: "teams", label: "Команди", icon: "🏠" },
    { id: "season", label: "Сезон", icon: "📅" },
  ];

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-2xl font-black">Рейтинг</h2>
        <p className="text-sm text-gray-500">Найкращі гравці та команди</p>
      </div>

      {/* Tab switcher */}
      <div className="bg-slate-800/60 rounded-2xl p-1 flex gap-1 mb-5 border border-slate-700/40">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { haptic("impact"); setTab(t.id); }}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
              tab === t.id
                ? "bg-emerald-500/20 text-emerald-400 shadow-lg shadow-emerald-900/10"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-slate-800/40 rounded-2xl p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-slate-700 rounded-xl" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-700 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-slate-700 rounded w-1/2" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* ---- Players ---- */}
          {tab === "players" && (
            <div>
              {/* Top 3 podium */}
              {players.length >= 3 && (
                <div className="flex items-end justify-center gap-2 mb-6 px-2">
                  <PodiumCard player={players[1]} place={2} />
                  <PodiumCard player={players[0]} place={1} />
                  <PodiumCard player={players[2]} place={3} />
                </div>
              )}

              {/* Rest of the list */}
              <div className="space-y-2">
                {players.slice(players.length >= 3 ? 3 : 0).map((p, i) => {
                  const rank = (players.length >= 3 ? 3 : 0) + i;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/50 border border-slate-700/30 transition-all hover:border-slate-600/50"
                    >
                      <div className="w-8 text-center">
                        <span className="text-sm font-bold text-gray-500">{rank + 1}</span>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-slate-700/60 flex items-center justify-center text-lg">
                        🪖
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{p.nickname}</div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2">
                          <span>{p.wins} перемог</span>
                          <span className="text-gray-700">•</span>
                          <span>{p.total_deaths} смертей</span>
                          <span className="text-gray-700">•</span>
                          <span>{p.games_played} ігор</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-black text-emerald-400">{p.rating}</div>
                        <div className="text-[10px] text-gray-600"> очок</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {!players.length && <EmptyState emoji="🏆" text="Поки що порожньо" />}
            </div>
          )}

          {/* ---- Teams ---- */}
          {tab === "teams" && (
            <div className="space-y-2">
              {teams.map((t, i) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 p-4 rounded-2xl border transition-all ${
                    i < 3
                      ? "bg-gradient-to-r from-slate-800/80 to-slate-700/40 border-slate-600/40"
                      : "bg-slate-800/40 border-slate-700/30"
                  }`}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl">
                    {i < 3 ? MEDALS[i] : (
                      <span className="text-sm font-bold text-gray-500">{i + 1}</span>
                    )}
                  </div>
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-xl">
                    🏠
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{t.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-emerald-400 text-lg">{t.rating}</div>
                    <div className="text-[10px] text-gray-500">pts</div>
                  </div>
                </div>
              ))}
              {!teams.length && <EmptyState emoji="🏠" text="Немає команд" />}
            </div>
          )}

          {/* ---- Season ---- */}
          {tab === "season" && season && (
            <div>
              {season.season ? (
                <>
                  {/* Season header */}
                  <div className="relative rounded-2xl overflow-hidden mb-5">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-700/40 via-teal-800/20 to-slate-900" />
                    <div className="relative p-5">
                      <div className="text-3xl mb-2">🏆</div>
                      <h3 className="text-xl font-black">{season.season.name}</h3>
                      <p className="text-sm text-emerald-300/70">📆 Старт: {season.season.start_date}</p>
                    </div>
                  </div>

                  {/* Season leaderboard */}
                  <div className="space-y-2">
                    {season.players.map((p, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-3 p-3 rounded-2xl border ${
                          i < 3
                            ? "bg-gradient-to-r from-slate-800/80 to-slate-700/40 border-slate-600/40"
                            : "bg-slate-800/40 border-slate-700/30"
                        }`}
                      >
                        <div className="w-9 text-center text-lg">
                          {i < 3 ? MEDALS[i] : <span className="text-sm text-gray-500">{i + 1}</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-sm truncate">{p.nickname}</div>
                          <div className="text-[11px] text-gray-500">
                            {p.season_wins}W • {p.season_deaths || 0}D • {p.season_games}G
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-emerald-400">{p.season_rating}</div>
                          <div className="text-[10px] text-gray-600">pts</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!season.players.length && <EmptyState emoji="📅" text="Сезон тільки почався" />}
                </>
              ) : (
                <EmptyState emoji="📅" text="Немає активного сезону" />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Podium card for top 3 ----
function PodiumCard({ player, place }) {
  const heights = { 1: "h-32", 2: "h-24", 3: "h-20" };
  const sizes = { 1: "w-16 h-16 text-2xl", 2: "w-13 h-13 text-xl", 3: "w-13 h-13 text-xl" };
  const borders = { 1: "border-amber-500/40 ring-2 ring-amber-500/20", 2: "border-slate-400/40", 3: "border-orange-700/40" };
  const bgGradients = {
    1: "from-amber-900/30 to-amber-950/20 border-amber-700/30",
    2: "from-slate-700/30 to-slate-800/20 border-slate-600/30",
    3: "from-orange-900/20 to-orange-950/10 border-orange-800/20",
  };

  return (
    <div className={`flex flex-col items-center ${place === 1 ? "order-2" : place === 2 ? "order-1" : "order-3"}`}>
      {/* Avatar */}
      <div className={`rounded-2xl bg-slate-700/60 flex items-center justify-center mb-2 border-2 ${sizes[place]} ${borders[place]}`}>
        🪖
      </div>

      {/* Medal */}
      <div className="text-xl mb-1">{MEDALS[place - 1]}</div>

      {/* Name */}
      <div className="text-xs font-bold text-center truncate max-w-[80px]">{player.nickname}</div>

      {/* Rating bar */}
      <div className={`${heights[place]} w-20 mt-2 rounded-t-xl bg-gradient-to-t ${bgGradients[place]} border flex items-start justify-center pt-2`}>
        <span className="font-black text-emerald-400 text-sm">{player.rating}</span>
      </div>
    </div>
  );
}

function EmptyState({ emoji, text }) {
  return (
    <div className="text-center py-16">
      <div className="text-5xl mb-4">{emoji}</div>
      <p className="text-gray-400 font-medium">{text}</p>
    </div>
  );
}