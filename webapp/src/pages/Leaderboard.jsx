import React, { useState, useEffect, useCallback, useRef } from "react";
import { getLeaderboard, getTeamsLeaderboard, getSeasonStats } from "../api";
import { useTelegram } from "../hooks/useTelegram";
import { getAvatarForLevel, getPlayerLevelState } from "../utils/playerLevel";
import { UserRound, Shield, CalendarDays, Trophy } from "lucide-react";

// Top-3 rank chip tones: brass / steel-gray / rust.
const RANK_TONES = [
  "text-amber-300 border-amber-400/40 bg-amber-400/10",
  "text-gray-200 border-gray-400/40 bg-gray-400/10",
  "text-orange-300 border-orange-500/40 bg-orange-500/10",
];

function RankChip({ rank, size = "w-7 h-7" }) {
  const tone = rank <= 3
    ? RANK_TONES[rank - 1]
    : "text-gray-500 border-slate-700/60 bg-slate-800/40";
  return (
    <div className={`${size} shrink-0 rounded border flex items-center justify-center font-mono text-xs font-bold ${tone}`}>
      {rank}
    </div>
  );
}
const displayName = (p) => p?.callsign || p?.nickname || "—";
const getPlayerAvatar = (rating) =>
  getAvatarForLevel(getPlayerLevelState(Number(rating) || 0).level);

export default function Leaderboard() {
  const PAGE_SIZE = 20;
  const [tab, setTab] = useState("players");
  const [players, setPlayers] = useState([]);
  const [playersHasMore, setPlayersHasMore] = useState(true);
  const [playersLoadingMore, setPlayersLoadingMore] = useState(false);
  const [teams, setTeams] = useState([]);
  const [season, setSeason] = useState(null);
  const [loading, setLoading] = useState(true);
  const { haptic } = useTelegram();
  const loadMoreRef = useRef(null);

  const loadPlayersPage = useCallback(async (offset, append) => {
    const res = await getLeaderboard({ limit: PAGE_SIZE, offset });
    const items = Array.isArray(res) ? res : res.items || [];
    const hasMore = Array.isArray(res) ? items.length >= PAGE_SIZE : !!res.hasMore;
    setPlayers((prev) => (append ? [...prev, ...items] : items));
    setPlayersHasMore(hasMore);
  }, []);

  useEffect(() => { load(); }, [tab, loadPlayersPage]);

  async function load() {
    setLoading(true);
    try {
      if (tab === "players") {
        await loadPlayersPage(0, false);
      }
      if (tab === "teams") setTeams(await getTeamsLeaderboard());
      if (tab === "season") setSeason(await getSeasonStats());
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const loadMorePlayers = useCallback(async () => {
    if (tab !== "players" || loading || playersLoadingMore || !playersHasMore) return;
    setPlayersLoadingMore(true);
    try {
      await loadPlayersPage(players.length, true);
    } catch (e) {
      console.error(e);
    } finally {
      setPlayersLoadingMore(false);
    }
  }, [tab, loading, playersLoadingMore, playersHasMore, players.length, loadPlayersPage]);

  useEffect(() => {
    if (tab !== "players") return undefined;
    if (!loadMoreRef.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first?.isIntersecting) {
          loadMorePlayers();
        }
      },
      { root: null, rootMargin: "120px", threshold: 0.01 },
    );
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [tab, loadMorePlayers, players.length, playersHasMore, playersLoadingMore, loading]);

  const tabs = [
    { id: "players", label: "Гравці", icon: UserRound },
    { id: "teams", label: "Команди", icon: Shield },
    { id: "season", label: "Сезон", icon: CalendarDays },
  ];

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="mb-5">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">Рейтинг</h2>
        <p className="font-mono text-[11px] uppercase tracking-wider text-gray-500">Найкращі гравці та команди</p>
      </div>

      {/* Tab switcher */}
      <div className="grid grid-cols-3 gap-1 mb-5 p-1 rounded-lg bg-slate-900/80 border border-slate-700/50">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { haptic("impact"); setTab(t.id); }}
              className={`flex items-center justify-center gap-1.5 py-2 rounded font-mono text-[11px] font-bold uppercase tracking-wider active:scale-95 ${
                tab === t.id
                  ? "bg-emerald-400 text-slate-950"
                  : "text-gray-400"
              }`}
            >
              <Icon className="w-3.5 h-3.5" strokeWidth={2} />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="bg-slate-900/60 border border-slate-700/40 rounded-2xl p-4 animate-pulse">
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
                  const avatar = getPlayerAvatar(p.rating);
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-700/50 transition-colors hover:border-slate-600/60"
                    >
                      <RankChip rank={rank + 1} />
                      <div
                        className={`w-10 h-10 rounded-lg bg-slate-950/70 bg-gradient-to-br ${avatar.bg} border border-white/10 flex items-center justify-center`}
                        style={{ boxShadow: `0 0 0 1px ${avatar.ring}55` }}
                      >
                        {avatar.emoji}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm truncate">{displayName(p)}</div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2">
                          <span>{p.wins} перемог</span>
                          <span className="text-gray-700">•</span>
                          <span>{p.total_deaths} смертей</span>
                          <span className="text-gray-700">•</span>
                          <span>{p.games_played} ігор</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-emerald-300">{p.rating}</div>
                        <div className="font-mono text-[10px] uppercase tracking-wider text-gray-600">очок</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={loadMoreRef} className="h-8" />
              {playersLoadingMore && (
                <div className="text-center text-xs text-gray-500 py-2">Завантаження...</div>
              )}

              {!players.length && <EmptyState icon={Trophy} text="Поки що порожньо" />}
            </div>
          )}

          {/* ---- Teams ---- */}
          {tab === "teams" && (
            <div className="space-y-2">
              {teams.map((t, i) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-3 p-4 rounded-2xl border ${
                    i < 3
                      ? "bg-slate-900/80 border-slate-600/60"
                      : "bg-slate-900/60 border-slate-700/50"
                  }`}
                >
                  <RankChip rank={i + 1} size="w-8 h-8" />
                  <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-600/60 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-emerald-300" strokeWidth={2} />
                  </div>
                  <div className="flex-1">
                    <div className="font-bold">{t.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-mono font-bold text-emerald-300 text-lg">{t.rating}</div>
                    <div className="font-mono text-[10px] uppercase tracking-wider text-gray-500">очок</div>
                  </div>
                </div>
              ))}
              {!teams.length && <EmptyState icon={Shield} text="Немає команд" />}
            </div>
          )}

          {/* ---- Season ---- */}
          {tab === "season" && season && (
            <div>
              {season.season ? (
                <>
                  {/* Season header */}
                  <div className="relative rounded-2xl overflow-hidden mb-5 border border-slate-600/50">
                    <div className="camo absolute inset-0" />
                    <div className="absolute inset-0 bg-slate-950/70" />
                    <div className="relative p-5 flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-slate-950/70 border border-amber-400/40 flex items-center justify-center shrink-0">
                        <Trophy className="w-6 h-6 text-amber-300" strokeWidth={2} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-display text-2xl font-bold uppercase tracking-wide truncate">{season.season.name}</h3>
                        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-gray-300">
                          <CalendarDays className="w-3.5 h-3.5 text-gray-500" strokeWidth={2} />
                          Старт: {season.season.start_date}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Season leaderboard */}
                  <div className="space-y-2">
                    {season.players.map((p, i) => {
                      const avatar = getPlayerAvatar(p.season_rating);
                      return (
                        <div
                          key={i}
                          className={`flex items-center gap-3 p-3 rounded-2xl border ${
                            i < 3
                              ? "bg-slate-900/80 border-slate-600/60"
                              : "bg-slate-900/60 border-slate-700/50"
                          }`}
                        >
                          <RankChip rank={i + 1} />
                          <div
                            className={`w-9 h-9 rounded-lg bg-slate-950/70 bg-gradient-to-br ${avatar.bg} border border-white/10 flex items-center justify-center`}
                            style={{ boxShadow: `0 0 0 1px ${avatar.ring}55` }}
                          >
                            {avatar.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-bold text-sm truncate">{displayName(p)}</div>
                            <div className="font-mono text-[11px] text-gray-500">
                              {p.season_wins}W • {p.season_deaths || 0}D • {p.season_games}G
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-mono font-bold text-emerald-300">{p.season_rating}</div>
                            <div className="font-mono text-[10px] uppercase tracking-wider text-gray-600">очок</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {!season.players.length && <EmptyState icon={CalendarDays} text="Сезон тільки почався" />}
                </>
              ) : (
                <EmptyState icon={CalendarDays} text="Немає активного сезону" />
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
  const avatar = getPlayerAvatar(player?.rating);
  const heights = { 1: "h-28", 2: "h-20", 3: "h-16" };
  const sizes = { 1: "w-16 h-16", 2: "w-[52px] h-[52px]", 3: "w-[52px] h-[52px]" };
  const borders = { 1: "border-amber-400/60", 2: "border-gray-400/50", 3: "border-orange-500/50" };
  const blocks = {
    1: "bg-slate-900/90 border-amber-400/40",
    2: "bg-slate-900/80 border-slate-600/60",
    3: "bg-slate-900/70 border-slate-700/60",
  };
  const stripe = { 1: "bg-amber-400", 2: "bg-gray-400", 3: "bg-orange-500" };

  return (
    <div className={`flex flex-col items-center ${place === 1 ? "order-2" : place === 2 ? "order-1" : "order-3"}`}>
      {/* Avatar */}
      <div
        className={`rounded-lg bg-slate-950/70 bg-gradient-to-br ${avatar.bg} flex items-center justify-center mb-2 border-2 ${sizes[place]} ${borders[place]}`}
      >
        {avatar.emoji}
      </div>

      {/* Name */}
      <div className="text-xs font-bold text-center truncate max-w-[84px]">{displayName(player)}</div>

      {/* Podium block */}
      <div className={`relative ${heights[place]} w-20 mt-2 rounded-t border border-b-0 overflow-hidden ${blocks[place]} flex flex-col items-center justify-start pt-2 gap-1`}>
        <span className={`absolute inset-x-0 top-0 h-[3px] ${stripe[place]}`} />
        <RankChip rank={place} size="w-6 h-6" />
        <span className="font-mono font-bold text-emerald-300 text-sm">{player.rating}</span>
      </div>
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="text-center py-16">
      <Icon className="w-12 h-12 mx-auto mb-4 text-slate-500" strokeWidth={1.5} />
      <p className="text-gray-400 font-medium">{text}</p>
    </div>
  );
}
