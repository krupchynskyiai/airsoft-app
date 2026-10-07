import React, { useState, useEffect } from "react";
import { getGames } from "../api";
import { useTelegram } from "../hooks/useTelegram";
import { MapPin, Clock, Users, Wallet, RotateCw, Handshake, Crosshair, ChevronRight } from "lucide-react";

const MODE = { team_vs_team: "TvT", random_teams: "Random", ffa: "FFA" };
const MONTHS = ["СІЧ", "ЛЮТ", "БЕР", "КВІ", "ТРА", "ЧЕР", "ЛИП", "СЕР", "ВЕР", "ЖОВ", "ЛИС", "ГРУ"];

const STATUS_CONFIG = {
  upcoming: { accent: "bg-emerald-400", border: "border-slate-600/50", badge: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10", label: "Скоро", dot: "bg-emerald-400" },
  checkin: { accent: "bg-amber-400", border: "border-amber-500/30", badge: "text-amber-300 border-amber-400/30 bg-amber-400/10", label: "Check-in", dot: "bg-amber-400 animate-pulse" },
  active: { accent: "bg-red-400", border: "border-red-500/40", badge: "text-red-300 border-red-400/40 bg-red-400/10", label: "LIVE", dot: "bg-red-400 animate-pulse" },
  finished: { accent: "bg-slate-500", border: "border-slate-700/50", badge: "text-gray-400 border-slate-600/50 bg-slate-700/30", label: "Архів", dot: "bg-gray-500" },
  cancelled: { accent: "bg-slate-700", border: "border-slate-800/50", badge: "text-gray-500 border-slate-700/50 bg-slate-800/30", label: "Скасована", dot: "bg-gray-600" },
};

function parseDate(date) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ""));
  if (!m) return null;
  return { day: m[3], month: MONTHS[Number(m[2]) - 1] || "", year: m[1] };
}

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
    { id: "all", label: "Всі" },
    { id: "upcoming", label: "Скоро" },
    { id: "active", label: "Live" },
    { id: "finished", label: "Архів" },
  ];

  const activeCount = games.filter((g) => g.status === "active").length;

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="font-display text-3xl font-bold uppercase tracking-wide">Ігри</h2>
          <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">{games.length} подій</p>
        </div>
        {activeCount > 0 && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-400/30 px-3 py-1.5 rounded">
            <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
            <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-red-300">{activeCount} LIVE</span>
          </div>
        )}
      </div>

      {/* Filter pills */}
      <div className="grid grid-cols-4 gap-1 mb-5 p-1 rounded-lg bg-slate-900/80 border border-slate-700/50">
        {filters.map((f) => (
          <button
            key={f.id}
            onClick={() => { haptic("impact"); setFilter(f.id); }}
            className={`py-2 rounded font-mono text-[11px] font-bold uppercase tracking-wider active:scale-95 ${
              filter === f.id
                ? "bg-emerald-400 text-slate-950"
                : "text-gray-400"
            }`}
          >
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
          <Crosshair className="w-12 h-12 mx-auto mb-4 text-slate-500" strokeWidth={1.5} />
          <p className="text-gray-400 font-medium">Немає ігор</p>
          <p className="text-gray-600 text-sm mt-1">Поки що тут порожньо</p>
        </div>
      ) : (
        <div className="space-y-3">
          {games.map((g, idx) => {
            const st = STATUS_CONFIG[g.status] || STATUS_CONFIG.upcoming;
            const d = parseDate(g.date);
            const freeSlots =
              typeof g.max_players === "number"
                ? Math.max(0, g.max_players - g.player_count)
                : null;
            return (
              <button
                key={g.id}
                onClick={() => { haptic("impact"); onOpenGame(g.id); }}
                className={`relative w-full text-left overflow-hidden rounded-2xl bg-slate-900/80 border ${st.border} hover:border-slate-500/60 active:scale-[0.99]`}
                style={{ animationDelay: `${idx * 50}ms` }}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${st.accent}`} />

                <div className="flex">
                  {/* Date block */}
                  <div className="flex w-[68px] shrink-0 flex-col items-center justify-center border-r border-slate-700/50 bg-slate-800/40 py-3">
                    {d ? (
                      <>
                        <span className="font-display text-[28px] font-bold leading-none text-gray-100">{d.day}</span>
                        <span className="mt-1 font-mono text-[10px] font-bold tracking-wider text-gray-400">{d.month}</span>
                      </>
                    ) : (
                      <span className="font-mono text-xs text-gray-400">{g.date}</span>
                    )}
                    {g.time && <span className="mt-1.5 font-mono text-[11px] text-emerald-300">{g.time}</span>}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1 p-3.5 pl-3">
                    <div className="mb-2 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${st.badge}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />
                        {st.label}
                      </span>
                      <span className="rounded border border-slate-600/50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-300">
                        {MODE[g.game_mode] || g.game_mode}
                      </span>
                      <span className="ml-auto font-mono text-[11px] text-gray-500">#{g.id}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[15px] font-semibold text-gray-100 min-w-0">
                      <MapPin className="h-4 w-4 shrink-0 text-gray-500" strokeWidth={2} />
                      <span className="truncate">{g.location}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-gray-400">
                      {g.duration && (
                        <span className="flex items-center gap-1.5">
                          <Clock className="h-3.5 w-3.5 text-gray-500" strokeWidth={2} />
                          {g.duration}
                        </span>
                      )}
                      {typeof g.payment === "number" && (
                        <span className="flex items-center gap-1.5">
                          <Wallet className="h-3.5 w-3.5 text-gray-500" strokeWidth={2} />
                          <span className="font-semibold text-gray-200">{g.payment}</span> грн
                        </span>
                      )}
                      {g.current_round > 0 && (
                        <span className="flex items-center gap-1.5 text-red-300">
                          <RotateCw className="h-3.5 w-3.5" strokeWidth={2} />
                          Раунд {g.current_round}
                        </span>
                      )}
                    </div>

                    {/* Slots */}
                    <div className="mt-3">
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="flex items-center gap-1.5 text-gray-400">
                          <Users className="h-3.5 w-3.5 text-gray-500" strokeWidth={2} />
                          <span className="font-semibold text-gray-200">{g.player_count}</span>
                          {typeof g.max_players === "number" && <span className="text-gray-500">/ {g.max_players}</span>}
                        </span>
                        {freeSlots !== null && (
                          <span className={`font-mono uppercase tracking-wider ${freeSlots === 0 ? "text-red-300" : "text-gray-500"}`}>
                            {freeSlots === 0 ? "Місць немає" : `Вільно ${freeSlots}`}
                          </span>
                        )}
                      </div>
                      {typeof g.max_players === "number" && g.max_players > 0 && (
                        <div className="h-1 overflow-hidden rounded-full bg-slate-700/60">
                          <div
                            className={`h-full rounded-full transition-all duration-700 ease-smooth ${freeSlots === 0 ? "bg-red-400" : "bg-emerald-400"}`}
                            style={{ width: `${Math.min(100, (g.player_count / g.max_players) * 100)}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {Array.isArray(g.friends_in_game) && g.friends_in_game.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-emerald-300">
                        <Handshake className="h-3.5 w-3.5 shrink-0" strokeWidth={2} />
                        <span className="truncate">Друзі: {g.friends_in_game.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center pr-2 text-slate-500">
                    <ChevronRight className="h-4 w-4" />
                  </div>
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