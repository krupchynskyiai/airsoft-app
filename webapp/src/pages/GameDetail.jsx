import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getGameDetail,
  joinGame,
  cancelJoinGame,
  checkinGame,
  reportDead,
  getRoundStatus,
  getMvpState,
  voteMvp,
  adminKillPlayer,
  adminEndRound,
  adminSetGameStatus,
  adminReviewCheckin,
  adminKickFromGame,
   adminMoveGameTeam,
} from "../api";
import { useTelegram } from "../hooks/useTelegram";

const MODE = { team_vs_team: "Team vs Team", random_teams: "Random Teams", ffa: "FFA" };
const TEAM_COLORS = {
  A: { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-400", label: "🔵 Team A", dot: "bg-blue-400" },
  B: { bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-400", label: "🔴 Team B", dot: "bg-red-400" },
};

// ---- Round Timer Hook ----
function useRoundTimer(startedAt, isActive) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive || !startedAt) { setElapsed(0); return; }

    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.floor((Date.now() - start) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, isActive]);

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function GameDetail({ gameId, onBack, isAdmin }) {
  const [data, setData] = useState(null);
  const [round, setRound] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [mvpState, setMvpState] = useState(null);
  const [mvpLoading, setMvpLoading] = useState(false);
  const { haptic, showAlert } = useTelegram();

  const load = useCallback(async () => {
    try {
      const d = await getGameDetail(gameId);
      setData(d);
      if (d.game.status === "active") {
        const r = await getRoundStatus(gameId);
        setRound(r);
      } else {
        setRound(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (data?.game?.status !== "active") return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [data?.game?.status, load]);

  async function doAction(fn, successMsg) {
    setActionLoading(true);
    try {
      await fn();
      haptic("success");
      if (successMsg) showAlert(successMsg);
      await load();
    } catch (e) {
      showAlert(e.message);
      haptic("error");
    } finally {
      setActionLoading(false);
    }
  }

  // Round timer
  const timerValue = useRoundTimer(
    round?.round?.started_at,
    round?.active || false
  );

  // Is round currently between rounds (no active round)?
  const isActiveGame = data?.game?.status === "active";
  const hasActiveRound = round?.active || false;
  const isBetweenRounds = isActiveGame && !hasActiveRound;

  // MVP voting state (latest finished round)
  useEffect(() => {
    if (!data?.game) return;
    if (!isBetweenRounds) {
      setMvpState(null);
      return;
    }
    let cancelled = false;
    async function loadMvp() {
      try {
        setMvpLoading(true);
        const s = await getMvpState(gameId);
        if (!cancelled) {
          setMvpState(s.hasRound ? s : null);
        }
      } catch {
        if (!cancelled) setMvpState(null);
      } finally {
        if (!cancelled) setMvpLoading(false);
      }
    }
    loadMvp();
    return () => {
      cancelled = true;
    };
  }, [gameId, isBetweenRounds, data?.game]);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-8 bg-slate-800 rounded-xl w-1/4" />
        <div className="h-48 bg-slate-800 rounded-2xl" />
        <div className="h-32 bg-slate-800 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-3">😕</div>
        <p className="text-gray-400">Гру не знайдено</p>
        <button onClick={onBack} className="text-emerald-400 text-sm mt-4">← Назад</button>
      </div>
    );
  }

  const { game: g, players, rounds, myRegistration, myWaitlist } = data;

  return (
    <div className="pb-6">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-4 active:opacity-60 transition-opacity">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        Назад до ігор
      </button>

      {/* ---- Hero card ---- */}
      <div className="relative rounded-2xl overflow-hidden mb-5">
        <div className={`absolute inset-0 ${
          g.status === "active" ? "bg-gradient-to-br from-red-700/40 via-orange-800/20 to-slate-900"
            : g.status === "finished" ? "bg-gradient-to-br from-slate-700/40 to-slate-900"
            : "bg-gradient-to-br from-emerald-700/30 via-teal-800/20 to-slate-900"
        }`} />
        <div className="relative p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-gray-400 font-mono text-sm">#{g.id}</span>
                {g.status === "active" && (
                  <div className="flex items-center gap-1.5 bg-red-500/20 px-2.5 py-0.5 rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                    <span className="text-[11px] font-bold text-red-400">LIVE</span>
                  </div>
                )}
              </div>
              <h2 className="text-xl font-black">Гра #{g.id}</h2>
            </div>
            <StatusBadge status={g.status} />
          </div>

          <div className="space-y-1.5 text-[15px]">
            <p>📅 {g.date} {g.time && <span className="text-gray-400">о {g.time}</span>}</p>
            <p className="text-gray-300">📍 {g.location}</p>
            <p className="text-gray-300">🎯 {MODE[g.game_mode]}</p>
            {g.duration && (
              <p className="text-gray-300">
                ⏱ Тривалість: <span className="font-semibold">{g.duration}</span>
              </p>
            )}
            {typeof g.payment === "number" && (
              <p className="text-gray-400">🪙 Вартість участі: <span className="font-semibold text-gray-300">{g.payment} грн</span></p>
            )}
          </div>

          {/* Round counter + timer */}
          {g.status === "active" && (
            <div className="mt-4 flex items-center justify-center gap-4 bg-red-500/10 border border-red-500/20 rounded-xl py-3 px-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-sm font-bold text-red-300">
                  {hasActiveRound ? `Раунд ${g.current_round}` : "Перерва"}
                </span>
              </div>
              {hasActiveRound && (
                <div className="bg-slate-900/60 px-3 py-1 rounded-lg">
                  <span className="text-lg font-mono font-black text-white">{timerValue}</span>
                </div>
              )}
            </div>
          )}

          {/* Player count */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-white/10">
            <div className="flex items-center gap-1.5">
              <span>👥</span>
              <span className="font-bold">{players.length}</span>
              <span className="text-gray-400 text-sm">гравців</span>
            </div>
            {g.current_round > 0 && (
              <div className="flex items-center gap-1.5">
                <span>🔄</span>
                <span className="font-bold">{rounds.length}</span>
                <span className="text-gray-400 text-sm">раундів</span>
              </div>
            )}
            {myRegistration && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10">
                <div
                  className={`w-1.5 h-1.5 rounded-full ${
                    myRegistration.attendance === "checked_in"
                      ? "bg-emerald-400"
                      : myRegistration.attendance === "checkin_pending"
                      ? "bg-amber-400"
                      : "bg-slate-500"
                  }`}
                />
                <span className="text-[11px] font-bold text-emerald-100">
                  {myRegistration.attendance === "checked_in"
                    ? "Check-in підтверджено"
                    : myRegistration.attendance === "checkin_pending"
                    ? "Очікує підтвердження"
                    : "Записаний"}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ---- Player actions ---- */}
      {g.status !== "finished" && g.status !== "cancelled" && (
        <div className="space-y-2 mb-5">
          {!myRegistration && !myWaitlist && (
            <ActionButton
              onClick={() =>
                doAction(async () => {
                  const res = await joinGame(gameId);
                  if (res.waitlisted) {
                    showAlert("🕒 Гра заповнена. Тебе додано до листа очікування.");
                  } else {
                    showAlert("✅ Ти записався на гру");
                  }
                })
              }
              loading={actionLoading}
              icon="📝"
              label="Записатись на гру"
              className="bg-gradient-to-r from-emerald-600 to-teal-600"
            />
          )}
          {!myRegistration && myWaitlist && (
            <ActionButton
              onClick={() => {}}
              loading={false}
              icon="🕒"
              label="Ти у листі очікування"
              className="bg-slate-700/70"
            />
          )}
          {myRegistration && (g.status === "upcoming" || g.status === "checkin") && (
            <ActionButton
              onClick={() => doAction(() => cancelJoinGame(gameId), "Запис скасовано")}
              loading={actionLoading}
              icon="❌"
              label="Скасувати запис"
              className="bg-gradient-to-r from-slate-700 to-red-700"
            />
          )}
          {myRegistration?.attendance === "registered" &&
            g.status === "checkin" && (
            <ActionButton onClick={() => doAction(() => checkinGame(gameId))} loading={actionLoading} icon="📍" label="Check-in — я на місці" className="bg-gradient-to-r from-amber-600 to-orange-600" />
          )}
          {g.status === "active" && hasActiveRound && myRegistration?.attendance === "checked_in" && (
            <ActionButton onClick={() => doAction(() => reportDead(gameId))} loading={actionLoading} icon="💀" label="Мене вбили" className="bg-gradient-to-r from-red-700 to-red-800" />
          )}
        </div>
      )}

      {/* ---- Admin panel ---- */}
      {isAdmin && g.status !== "finished" && g.status !== "cancelled" && (
        <div className="bg-orange-950/20 border border-orange-800/30 rounded-2xl p-4 mb-5 space-y-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-base">⚙️</span>
            <h3 className="text-sm font-bold text-orange-400 uppercase tracking-wider">
              Адмін
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {g.status === "upcoming" && (
              <SmallButton
                onClick={() =>
                  doAction(() => adminSetGameStatus(gameId, "checkin"))
                }
                icon="📍"
                label="Відкрити Check-in"
                color="amber"
              />
            )}
            {g.status === "checkin" && (
              <SmallButton
                onClick={() =>
                  doAction(() => adminSetGameStatus(gameId, "active"))
                }
                icon="▶️"
                label="Почати гру"
                color="red"
              />
            )}
            {g.status === "active" && (
              <SmallButton
                onClick={() =>
                  doAction(
                    () => adminSetGameStatus(gameId, "finished"),
                    "🏁 Гру завершено!",
                  )
                }
                icon="🏁"
                label="Завершити гру"
                color="red"
              />
            )}
            {/* Cancel game in any non-final state */}
            {g.status !== "finished" && g.status !== "cancelled" && (
              <SmallButton
                onClick={() =>
                  doAction(
                    () => adminSetGameStatus(gameId, "cancelled"),
                    "❌ Гру скасовано",
                  )
                }
                icon="❌"
                label="Скасувати гру"
                color="emerald"
              />
            )}
          </div>

          {/* Pending check-ins list */}
          {g.status === "checkin" &&
            players.some((p) => p.attendance === "checkin_pending") && (
              <div className="mt-3 bg-slate-900/40 border border-amber-700/40 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">📍</span>
                  <p className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                    Check-in очікують підтвердження
                  </p>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {players
                    .filter((p) => p.attendance === "checkin_pending")
                    .map((p) => (
                      <div
                        key={p.player_id}
                        className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-slate-800/70"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          <span className="text-xs font-medium">
                            {p.nickname}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() =>
                              doAction(
                                () =>
                                  adminReviewCheckin(
                                    gameId,
                                    p.player_id,
                                    "confirm",
                                  ),
                                "Check-in підтверджено",
                              )
                            }
                            className="px-2 py-1 rounded-lg bg-emerald-600/70 text-[10px] font-bold text-white active:scale-95"
                          >
                            ✅ Так
                          </button>
                          <button
                            onClick={() =>
                              doAction(
                                () =>
                                  adminReviewCheckin(
                                    gameId,
                                    p.player_id,
                                    "reject",
                                  ),
                                "Check-in скасовано",
                              )
                            }
                            className="px-2 py-1 rounded-lg bg-red-700/70 text-[10px] font-bold text-white active:scale-95"
                          >
                            ✕ Ні
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* ---- Between rounds: MVP voting + start next round ---- */}
      {isBetweenRounds && (
        <div className="space-y-3 mb-5">
          {/* MVP voting block */}
          {mvpState && (
            <div className="bg-slate-900/50 border border-amber-700/40 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">⭐</span>
                  <div>
                    <h3 className="text-sm font-bold text-amber-300 uppercase tracking-wider">
                      MVP Раунду {mvpState.round_number}
                    </h3>
                    <p className="text-[11px] text-gray-400">
                      Голосує тільки команда-переможець
                    </p>
                  </div>
                </div>
              </div>
              {mvpLoading ? (
                <div className="text-xs text-gray-500">Завантаження...</div>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {mvpState.candidates.map((c) => {
                    const isMine = mvpState.myVoteTargetId === c.player_id;
                    return (
                      <div
                        key={c.player_id}
                        className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-slate-800/60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{isMine ? "✅" : "🪖"}</span>
                          <span className="text-xs font-medium">
                            {c.nickname}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">
                            Голосів:{" "}
                            <span className="font-semibold text-amber-300">
                              {c.mvp_votes}
                            </span>
                          </span>
                          {mvpState.canVote && !isMine && (
                            <button
                              onClick={async () => {
                                try {
                                  haptic("impact");
                                  await voteMvp(
                                    gameId,
                                    mvpState.round_id,
                                    c.player_id,
                                  );
                                  showAlert(
                                    `✅ Ти проголосував за ${c.nickname} як MVP`,
                                  );
                                  const s = await getMvpState(gameId);
                                  setMvpState(s.hasRound ? s : null);
                                } catch (e) {
                                  showAlert(e.message);
                                  haptic("error");
                                }
                              }}
                              className="px-2 py-1 rounded-lg bg-emerald-600/70 text-[10px] font-bold text-white active:scale-95"
                            >
                              Голосувати
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Admin: start next round */}
          {isAdmin && (
            <div className="bg-emerald-950/20 border border-emerald-800/30 rounded-2xl p-5 text-center">
              <div className="text-3xl mb-2">⏸</div>
              <h3 className="text-lg font-black mb-1">Перерва між раундами</h3>
              <p className="text-sm text-gray-400 mb-4">
                Раундів зіграно:{" "}
                {rounds.filter((r) => r.status === "finished").length}
              </p>
              <button
                onClick={() => doAction(() => adminStartRound(gameId))}
                disabled={actionLoading}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-4 rounded-2xl font-bold text-[15px] shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {actionLoading ? <Spinner /> : "▶️ Почати наступний раунд"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---- Live round panel ---- */}
      {g.status === "active" && hasActiveRound && (
        <div className="bg-red-950/15 border border-red-800/30 rounded-2xl p-4 mb-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
              <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider">
                Раунд {g.current_round}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-mono font-bold text-gray-300">{timerValue}</span>
              <button onClick={load} className="text-xs text-gray-500 bg-slate-800/60 px-2 py-1 rounded-lg active:scale-95 transition-transform">
                🔄
              </button>
            </div>
          </div>

          {/* Teams/players */}
          {(() => {
            const teams = {};
            round.players.forEach((p) => {
              const t = p.game_team || "?";
              if (!teams[t]) teams[t] = [];
              teams[t].push(p);
            });

            return Object.entries(teams).map(([team, tPlayers]) => {
              const tc = TEAM_COLORS[team] || { bg: "bg-slate-700/20", border: "border-slate-600/30", text: "text-gray-300", label: `Team ${team}`, dot: "bg-gray-400" };
              const alive = tPlayers.filter((p) => p.is_alive).length;

              return (
                <div key={team} className="mb-4 last:mb-0">
                  {g.game_mode !== "ffa" && (
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${tc.dot}`} />
                        <span className={`text-sm font-bold ${tc.text}`}>{tc.label}</span>
                      </div>
                      <span className="text-xs text-gray-500">{alive}/{tPlayers.length} alive</span>
                    </div>
                  )}
                  <div className="space-y-1">
                    {tPlayers.map((p) => (
                      <div
                        key={p.player_id}
                        className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${
                          p.is_alive ? `${tc.bg} border ${tc.border}` : "bg-slate-800/30 border border-slate-800/30 opacity-50"
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="text-lg">{p.is_alive ? "💚" : "💀"}</span>
                          <span className={`text-sm font-semibold ${p.is_alive ? "" : "line-through text-gray-500"}`}>
                            {p.nickname}
                          </span>
                        </div>
                        {isAdmin && p.is_alive && (
                          <button
                            onClick={() => doAction(() => adminKillPlayer(gameId, p.player_id))}
                            className="text-xs bg-red-800/60 hover:bg-red-700/60 px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-all"
                          >
                            💀 Kill
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            });
          })()}

          {/* End round buttons */}
          {isAdmin && (
            <div className="mt-4 pt-3 border-t border-red-900/30">
              {g.game_mode !== "ffa" ? (
                <>
                  <p className="text-xs text-gray-500 mb-2 font-medium">Завершити раунд — хто виграв?</p>
                  <div className="flex gap-2">
                    <button onClick={() => doAction(() => adminEndRound(gameId, "A"))} className="flex-1 bg-blue-700/40 border border-blue-600/30 py-2.5 rounded-xl text-sm font-bold text-blue-300 active:scale-95 transition-transform">
                      🔵 Team A
                    </button>
                    <button onClick={() => doAction(() => adminEndRound(gameId, "B"))} className="flex-1 bg-red-700/40 border border-red-600/30 py-2.5 rounded-xl text-sm font-bold text-red-300 active:scale-95 transition-transform">
                      🔴 Team B
                    </button>
                  </div>
                </>
              ) : (
                <button
                  onClick={() => doAction(() => adminEndRound(gameId, null))}
                  className="w-full bg-slate-700/60 border border-slate-600/30 py-2.5 rounded-xl text-sm font-bold text-gray-300 active:scale-95 transition-transform"
                >
                  ⏹ Завершити раунд
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ---- Players list ---- */}
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-slate-700/40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>👥</span>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Гравці</h3>
          </div>
          <span className="text-xs text-gray-500 bg-slate-700/60 px-2 py-0.5 rounded-full">{players.length}</span>
        </div>
        <div className="space-y-1">
          {players.map((p) => (
            <div
              key={p.player_id}
              className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-slate-700/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    p.attendance === "checked_in"
                      ? "bg-emerald-400"
                      : p.attendance === "checkin_pending"
                      ? "bg-amber-400"
                      : p.attendance === "no_show"
                      ? "bg-red-400"
                      : "bg-gray-600"
                  }`}
                />
                <div>
                  <span className="text-sm font-medium">{p.nickname}</span>
                  {p.game_team && (
                    <span
                      className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        p.game_team === "A"
                          ? "bg-blue-500/20 text-blue-400"
                          : p.game_team === "B"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-slate-600 text-gray-400"
                      }`}
                    >
                      {p.game_team}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {p.team_name && (
                  <span className="text-[11px] text-gray-500">
                    {p.team_name}
                  </span>
                )}
                <span className="text-[10px] text-gray-600">⭐{p.rating}</span>
                {isAdmin &&
                  (g.status === "checkin" || g.status === "active") &&
                  g.game_mode !== "ffa" &&
                  (p.game_team === "A" || p.game_team === "B") && (
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        onClick={() =>
                          doAction(
                            () => adminMoveGameTeam(gameId, p.player_id, "A"),
                            "Гравця переміщено в команду A",
                          )
                        }
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold active:scale-95 transition-all ${
                          p.game_team === "A"
                            ? "bg-blue-600 text-white"
                            : "bg-slate-700 text-gray-200"
                        }`}
                      >
                        A
                      </button>
                      <button
                        onClick={() =>
                          doAction(
                            () => adminMoveGameTeam(gameId, p.player_id, "B"),
                            "Гравця переміщено в команду B",
                          )
                        }
                        className={`px-2 py-1 rounded-lg text-[10px] font-semibold active:scale-95 transition-all ${
                          p.game_team === "B"
                            ? "bg-red-600 text-white"
                            : "bg-slate-700 text-gray-200"
                        }`}
                      >
                        B
                      </button>
                    </div>
                  )}
                {isAdmin &&
                  g.status !== "finished" &&
                  g.status !== "cancelled" &&
                  p.attendance !== "no_show" && (
                    <button
                      onClick={() =>
                        doAction(
                          () => adminKickFromGame(gameId, p.player_id),
                          "Гравця видалено з гри",
                        )
                      }
                      className="ml-1 px-2 py-1 rounded-lg bg-red-800/60 text-[10px] font-semibold text-red-100 active:scale-95"
                    >
                      Кік
                    </button>
                  )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Rounds history ---- */}
      {rounds.length > 0 && (
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/40">
          <div className="flex items-center gap-2 mb-3">
            <span>🔄</span>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Раунди</h3>
          </div>
          <div className="space-y-2">
            {rounds.map((r) => {
              const winColor = r.winner_game_team === "A" ? "text-blue-400" : r.winner_game_team === "B" ? "text-red-400" : "text-gray-400";
              const duration = r.started_at && r.ended_at
                ? formatDuration(new Date(r.ended_at) - new Date(r.started_at))
                : r.status === "active" ? timerValue : "";
              return (
                <div key={r.id} className="flex items-center justify-between py-2 px-3 rounded-xl bg-slate-700/20">
                  <div className="flex items-center gap-2">
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                      r.status === "active" ? "bg-red-500/20 text-red-400" : r.status === "finished" ? "bg-emerald-500/15 text-emerald-400" : "bg-slate-700 text-gray-500"
                    }`}>{r.round_number}</span>
                    <span className="text-sm font-medium">Раунд {r.round_number}</span>
                    {r.status === "active" && (
                      <div className="flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-full">
                        <div className="w-1 h-1 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-[10px] font-bold text-red-400">LIVE</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {duration && <span className="text-[11px] text-gray-500 font-mono">{duration}</span>}
                    <span className={`text-sm font-bold ${winColor}`}>
                      {r.winner_game_team
                        ? r.winner_game_team === "A" ? "🔵 A" : "🔴 B"
                        : r.status === "active" ? "⏳" : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function adminStartRound(gameId) {
  const { default: api } = await import("../api");
  // We use the generic adminSetGameStatus but with a custom action
  const res = await fetch(`/api/admin/games/${gameId}/start-round`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-init-data": window.Telegram?.WebApp?.initData || "",
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed");
  return data;
}

function Spinner() {
  return <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />;
}

// ---- Sub-components ----

function StatusBadge({ status }) {
  const config = {
    upcoming: "bg-blue-500/20 text-blue-300 border-blue-500/20",
    checkin: "bg-amber-500/20 text-amber-300 border-amber-500/20",
    active: "bg-red-500/20 text-red-300 border-red-500/20",
    finished: "bg-slate-600/30 text-gray-400 border-slate-600/20",
    cancelled: "bg-slate-700/30 text-gray-500 border-slate-700/20",
  };
  const labels = { upcoming: "Очікується", checkin: "Check-in", active: "LIVE", finished: "Завершена", cancelled: "Скасована" };
  return <span className={`px-3 py-1 rounded-xl text-[11px] font-bold border ${config[status] || ""}`}>{labels[status] || status}</span>;
}

function ActionButton({ onClick, loading, icon, label, className }) {
  return (
    <button onClick={onClick} disabled={loading} className={`w-full flex items-center justify-center gap-2 py-4 rounded-2xl font-bold text-[15px] shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 ${className}`}>
      {loading ? <Spinner /> : <><span>{icon}</span>{label}</>}
    </button>
  );
}

function SmallButton({ onClick, icon, label, color }) {
  const colors = { amber: "bg-amber-700/40 border-amber-600/30 text-amber-300", red: "bg-red-700/40 border-red-600/30 text-red-300", emerald: "bg-emerald-700/40 border-emerald-600/30 text-emerald-300" };
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border active:scale-95 transition-transform ${colors[color] || colors.emerald}`}>
      <span>{icon}</span> {label}
    </button>
  );
}