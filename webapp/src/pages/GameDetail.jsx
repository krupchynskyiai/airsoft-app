import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  getGameDetail,
  joinGame,
  cancelJoinGame,
  checkinGame,
  reportDead,
  getRoundStatus,
  getMvpState,
  adminEndRoundBatch,
  adminSetGameStatus,
  adminReviewCheckin,
  adminKickFromGame,
   adminMoveGameTeam,
  adminShuffleGameTeams,
  adminSelectMvp,
  adminAddPlayersByUsername,
  getGameRides,
  createGameRide,
  requestRideSeats,
  respondRideRequest,
  deleteRide,
  kickRidePassenger,
  adminGetGameEquipmentStock,
  adminUpdateGameEquipmentStock,
} from "../api";
import { useTelegram } from "../hooks/useTelegram";

const MODE = { team_vs_team: "Team vs Team", random_teams: "Random Teams", ffa: "FFA" };
const TEAM_COLORS = {
  A: { bg: "bg-amber-500/15", border: "border-amber-500/35", text: "text-amber-300", label: "🟡 Team A", dot: "bg-amber-400" },
  B: { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-400", label: "🔵 Team B", dot: "bg-blue-400" },
};

function formatNick(n) {
  const s = String(n || "").trim();
  if (!s) return "—";
  return s;
}

function formatUpdatedAt(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("uk-UA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ROUND_SUBMIT_QUEUE_KEY = "airsoft.roundOutcomeQueue.v1";

function readRoundSubmitQueue() {
  try {
    const raw = localStorage.getItem(ROUND_SUBMIT_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRoundSubmitQueue(items) {
  try {
    localStorage.setItem(ROUND_SUBMIT_QUEUE_KEY, JSON.stringify(items));
  } catch {
    // ignore quota/storage errors; user still can retry manually
  }
}

// ---- Round Timer Hook ----
function useRoundTimer(startedAt, isActive) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!isActive || !startedAt) { setElapsed(0); return; }

    const startMs = Number(startedAt) > 0
      ? Number(startedAt) * 1000
      : new Date(String(startedAt).replace(" ", "T")).getTime();
    const tick = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - startMs) / 1000)));
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
  const [mvpPickOpen, setMvpPickOpen] = useState(false);
  const [mvpPickSelected, setMvpPickSelected] = useState(null);
  const [mvpPickPromptedRoundId, setMvpPickPromptedRoundId] = useState(null);
  const { haptic, showAlert, showConfirm } = useTelegram();
  const [addUsersText, setAddUsersText] = useState("");
  const [rides, setRides] = useState([]);
  const [ridesLoading, setRidesLoading] = useState(false);
  const [showRideModal, setShowRideModal] = useState(false);
  const [rideForm, setRideForm] = useState({
    seats_total: 3,
    depart_location: "",
    depart_time: "",
    car_make: "",
    car_color: "",
  });
  const [requestRideModal, setRequestRideModal] = useState(null); // { rideId, ownerNickname }
  const [requestSeats, setRequestSeats] = useState(1);
  const [showJoinEquipmentModal, setShowJoinEquipmentModal] = useState(false);
  const [joinEquipmentMap, setJoinEquipmentMap] = useState({});
  const [adminEquipmentItems, setAdminEquipmentItems] = useState([]);
  const [adminEqLoading, setAdminEqLoading] = useState(false);
  const [roundPendingKilledIds, setRoundPendingKilledIds] = useState([]);

  const isLoadingRef = useRef(false);

  const load = useCallback(async () => {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
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
      isLoadingRef.current = false;
      setLoading(false);
    }
  }, [gameId]);

  const loadRides = useCallback(async () => {
    try {
      setRidesLoading(true);
      const r = await getGameRides(gameId);
      setRides(r.rides || []);
    } catch (e) {
      // ignore silently to avoid breaking game page if tables not yet created
      setRides([]);
    } finally {
      setRidesLoading(false);
    }
  }, [gameId]);

  const refreshRoundOnly = useCallback(async () => {
    try {
      if (data?.game?.status !== "active") {
        setRound(null);
        return;
      }
      const r = await getRoundStatus(gameId);
      setRound(r);
    } catch (e) {
      console.error(e);
    }
  }, [gameId, data?.game?.status]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadRides(); }, [loadRides]);

  useEffect(() => {
    if (data?.game?.status !== "active" && data?.game?.status !== "checkin")
      return;
    const interval = setInterval(load, data?.game?.status === "active" ? 4000 : 3000);
    return () => clearInterval(interval);
  }, [data?.game?.status, load]);

  useEffect(() => {
    if (!isAdmin) return;
    if (!data?.game?.id) return;
    let cancelled = false;
    async function loadAdminEq() {
      try {
        setAdminEqLoading(true);
        const s = await adminGetGameEquipmentStock(data.game.id);
        if (!cancelled) setAdminEquipmentItems(s.items || []);
      } catch {
        if (!cancelled) setAdminEquipmentItems([]);
      } finally {
        if (!cancelled) setAdminEqLoading(false);
      }
    }
    loadAdminEq();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, data?.game?.id]);

  useEffect(() => {
    if (!showJoinEquipmentModal) return undefined;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [showJoinEquipmentModal]);

  function openJoinEquipmentModal() {
    const initial = {};
    const list = data?.equipmentState?.items || [];
    for (const it of list) {
      if (it.my_quantity > 0) initial[it.item_key] = it.my_quantity;
    }
    setJoinEquipmentMap(initial);
    setShowJoinEquipmentModal(true);
  }

  async function saveAdminEquipmentItem(item) {
    if (!data?.game?.id) return;
    try {
      setAdminEqLoading(true);
      await adminUpdateGameEquipmentStock(data.game.id, {
        item_key: item.item_key,
        total_qty:
          item.total_qty === "" || item.total_qty === undefined || item.total_qty === null
            ? null
            : Number(item.total_qty),
        is_disabled: !!item.is_disabled,
        notes: item.notes || null,
      });
      const s = await adminGetGameEquipmentStock(data.game.id);
      setAdminEquipmentItems(s.items || []);
      await load();
      showAlert("✅ Налаштування спорядження оновлено");
    } catch (e) {
      showAlert(e.message || "Не вдалося оновити спорядження");
    } finally {
      setAdminEqLoading(false);
    }
  }

  async function doAction(fn, successMsg, refreshMode = "full") {
    setActionLoading(true);
    try {
      const result = await fn();
      haptic("success");
      if (successMsg) {
        showAlert(typeof successMsg === "function" ? successMsg(result) : successMsg);
      }
      if (refreshMode === "round") {
        await refreshRoundOnly();
      } else if (refreshMode === "full") {
        await load();
      }
      await loadRides();
      return result;
    } catch (e) {
      showAlert(e.message);
      haptic("error");
    } finally {
      setActionLoading(false);
    }
  }

  function toggleRoundPendingDead(playerId, isAliveOnServer) {
    if (!isAdmin || !isAliveOnServer || actionLoading) return;
    setRoundPendingKilledIds((prev) =>
      prev.includes(playerId)
        ? prev.filter((id) => id !== playerId)
        : [...prev, playerId],
    );
  }

  async function flushRoundSubmitQueue() {
    const queue = readRoundSubmitQueue();
    if (!queue.length) return;

    const remaining = [];
    let changed = false;
    for (const item of queue) {
      try {
        await adminEndRoundBatch(item.gameId, {
          winner_team: item.winnerTeam,
          killed_player_ids: item.killedPlayerIds || [],
        });
        changed = true;
      } catch (e) {
        // Round was likely already closed by a previous successful request.
        if (String(e?.message || "").includes("No active round")) {
          changed = true;
          continue;
        }
        remaining.push(item);
      }
    }

    if (changed) {
      writeRoundSubmitQueue(remaining);
      await load();
      await loadRides();
    }
  }

  async function submitRoundOutcome(winnerTeam) {
    const picked = roundPendingKilledIds;
    setActionLoading(true);
    try {
      await adminEndRoundBatch(gameId, {
        winner_team: winnerTeam,
        killed_player_ids: picked,
      });
      setRoundPendingKilledIds([]);
      haptic("success");
      await load();
      await loadRides();
      await flushRoundSubmitQueue();
    } catch (e) {
      const pending = readRoundSubmitQueue();
      writeRoundSubmitQueue([
        ...pending,
        {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          gameId,
          winnerTeam,
          killedPlayerIds: picked,
          createdAt: new Date().toISOString(),
        },
      ]);
      setRoundPendingKilledIds([]);
      haptic("warning");
      showAlert("⚠️ Бекенд недоступний. Результат збережено локально і буде відправлено повторно.");
    } finally {
      setActionLoading(false);
    }
  }

  // Round timer
  const timerValue = useRoundTimer(
    round?.round?.started_at_ts || round?.round?.started_at,
    round?.active || false
  );

  // Is round currently between rounds (no active round)?
  const isActiveGame = data?.game?.status === "active";
  const hasActiveRound = round?.active || false;
  const isBetweenRounds = isActiveGame && !hasActiveRound;

  useEffect(() => {
    if (!hasActiveRound) {
      setRoundPendingKilledIds([]);
      return;
    }
    const aliveIds = new Set(
      (round?.players || [])
        .filter((p) => p.is_alive)
        .map((p) => p.player_id),
    );
    setRoundPendingKilledIds((prev) => prev.filter((id) => aliveIds.has(id)));
  }, [hasActiveRound, round?.round?.id, round?.players]);

  useEffect(() => {
    flushRoundSubmitQueue();
    function onOnline() {
      flushRoundSubmitQueue();
    }
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, [gameId, data?.game?.status]);

  // Адміну потрібно обрати MVP для щойно завершеного раунду,
  // перш ніж він зможе почати наступний.
  const adminNeedsMvp =
    isAdmin && isBetweenRounds && !!mvpState && !mvpLoading && mvpState.myVoteTargetId === null;

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

  // Auto-open MVP picker modal for admin after each finished round (once per round)
  useEffect(() => {
    if (!adminNeedsMvp) return;
    const rid = mvpState?.round_id || null;
    if (!rid) return;
    if (mvpPickPromptedRoundId === rid) return;

    setMvpPickPromptedRoundId(rid);
    setMvpPickSelected(null);
    setMvpPickOpen(true);
  }, [adminNeedsMvp, mvpState?.round_id, mvpPickPromptedRoundId]);

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

  const {
    game: g,
    players,
    rounds,
    myRegistration,
    myWaitlist,
    equipmentState,
    myEquipment,
    myEquipmentTotal,
    myTotalCost,
  } = data;
  const freeSlots =
    typeof g.max_players === "number"
      ? Math.max(0, g.max_players - players.length)
      : null;
  const equipmentItems = equipmentState?.items || [];

  const joinAdditionalCost = Object.entries(joinEquipmentMap).reduce((sum, [itemKey, qty]) => {
    const n = Number(qty) || 0;
    if (n <= 0) return sum;
    const it = equipmentItems.find((x) => x.item_key === itemKey);
    if (!it || it.unit_price == null) return sum;
    return sum + n * Number(it.unit_price || 0);
  }, 0);
  const joinTotalCost = (Number(g.payment) || 0) + joinAdditionalCost;
  const pendingDeadSet = new Set(roundPendingKilledIds);

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
            {!!g.score_round_outcomes_only && (
              <p className="text-amber-200/90 text-sm">
                📋 Рейтинг за підсумком раундів (перемога / нічия); смерті в раундах не впливають на очки.
              </p>
            )}
            {g.duration && (
              <p className="text-gray-300">
                ⏱ Тривалість: <span className="font-semibold">{g.duration}</span>
              </p>
            )}
            {typeof g.max_players === "number" && (
              <p className="text-gray-300 text-sm">
                👥 Вільних місць:{" "}
                <span className="font-semibold">
                  {freeSlots}
                </span>{" "}
                з {g.max_players}
              </p>
            )}
            {typeof g.payment === "number" && (
              <p className="text-gray-400">🪙 Вартість участі: <span className="font-semibold text-gray-300">{g.payment} грн</span></p>
            )}
            {myRegistration && myTotalCost != null && (
              <p className="text-gray-300">
                💳 Моя сума: <span className="font-semibold text-emerald-300">{myTotalCost} грн</span>
                {" "}
                <span className="text-xs text-gray-500">(база {g.payment || 0} + допи {myEquipmentTotal || 0})</span>
              </p>
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
              onClick={openJoinEquipmentModal}
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
              onClick={async () => {
                const ok = await showConfirm("Скасувати запис на цю гру?");
                if (!ok) return;
                doAction(() => cancelJoinGame(gameId), "Запис скасовано");
              }}
              loading={actionLoading}
              icon="❌"
              label="Скасувати запис"
              className="bg-gradient-to-r from-slate-700 to-red-700"
            />
          )}
          {myRegistration?.attendance === "registered" &&
            g.status === "checkin" && (
            <ActionButton
              onClick={async () => {
                const ok = await showConfirm(
                  "Підтвердити check-in: ви на місці проведення гри?",
                );
                if (!ok) return;
                doAction(() => checkinGame(gameId));
              }}
              loading={actionLoading}
              icon="📍"
              label="Check-in — я на місці"
              className="bg-gradient-to-r from-amber-600 to-orange-600"
            />
          )}
          {g.status === "active" && hasActiveRound && myRegistration?.attendance === "checked_in" && (
            <ActionButton
              onClick={async () => {
                const ok = await showConfirm(
                  "Повідомити, що вас вибули з раунду?",
                );
                if (!ok) return;
                doAction(() => reportDead(gameId));
              }}
              loading={actionLoading}
              icon="💀"
              label="Мене вбили"
              className="bg-gradient-to-r from-red-700 to-red-800"
            />
          )}
        </div>
      )}

      {myRegistration && Array.isArray(myEquipment) && myEquipment.length > 0 && (
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 mb-5 border border-slate-700/40">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Моє спорядження</h3>
            <span className="text-xs text-emerald-300 font-semibold">+{myEquipmentTotal || 0} грн</span>
          </div>
          <div className="space-y-1.5">
            {myEquipment.map((rw, idx) => {
              const def = equipmentItems.find((it) => it.item_key === rw.item_key);
              return (
                <div key={`${rw.item_key}_${idx}`} className="flex items-center justify-between text-xs bg-slate-900/50 border border-slate-700/40 rounded-xl px-3 py-2">
                  <span className="text-gray-200">{def?.title || rw.item_key}</span>
                  <span className="text-gray-400">
                    {rw.quantity} × {rw.unit_price ?? 0} ={" "}
                    <span className="text-emerald-300 font-semibold">{rw.total_price || 0} грн</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Rides / Logistics ---- */}
      {myRegistration && g.status !== "finished" && g.status !== "cancelled" && (
        <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 mb-5 border border-slate-700/40">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span>🚗</span>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                Поїздки
              </h3>
            </div>
            <button
              onClick={() => {
                haptic("impact");
                setRideForm((s) => ({
                  ...s,
                  seats_total: 3,
                  depart_location: "",
                  depart_time: "",
                  car_make: "",
                  car_color: "",
                }));
                setShowRideModal(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 active:scale-95 transition-transform"
            >
              Запропонувати
            </button>
          </div>

          {ridesLoading ? (
            <div className="text-xs text-gray-500">Завантаження...</div>
          ) : rides.length === 0 ? (
            <div className="text-xs text-gray-500">
              Поки що немає поїздок. Створи свою або підпишись на іншу.
            </div>
          ) : (
            <div className="space-y-2">
              {rides.map((r) => {
                const seatsFree = Math.max(0, r.seats_total - r.seats_accepted);
                const mineReq = r.myRequest?.status;
                return (
                  <div key={r.id} className="bg-slate-900/40 border border-slate-700/40 rounded-2xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-400">
                          Водій: <span className="font-semibold text-gray-200">{formatNick(r.owner_nickname)}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          👥 Місць: <span className="font-semibold text-gray-200">{seatsFree}</span> / {r.seats_total}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          📍 {r.depart_location}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          ⏰ {r.depart_time}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">
                          🚗 {r.car_make}, {r.car_color}
                        </div>
                        {r.updated_at && (
                          <div className="text-[10px] text-gray-600 mt-1">
                            Оновлено: {formatUpdatedAt(r.updated_at)}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 items-end">
                        {r.isOwner ? (
                          <>
                            <button
                              onClick={() => {
                                haptic("impact");
                                setRideForm({
                                  seats_total: r.seats_total || 1,
                                  depart_location: r.depart_location || "",
                                  depart_time: r.depart_time || "",
                                  car_make: r.car_make || "",
                                  car_color: r.car_color || "",
                                });
                                setShowRideModal(true);
                              }}
                              disabled={actionLoading}
                              className="px-2.5 py-1 rounded-lg bg-slate-700/40 border border-slate-600/40 text-[10px] font-bold text-gray-200 active:scale-95 disabled:opacity-50"
                            >
                              Редагувати
                            </button>
                            <button
                              onClick={async () => {
                                const ok = await showConfirm("Скасувати цю поїздку?");
                                if (!ok) return;
                                doAction(() => deleteRide(gameId, r.id), "Поїздку скасовано");
                              }}
                              disabled={actionLoading}
                              className="px-2.5 py-1 rounded-lg bg-red-700/30 border border-red-600/30 text-[10px] font-bold text-red-200 active:scale-95 disabled:opacity-50"
                            >
                              Скасувати
                            </button>
                          </>
                        ) : mineReq ? (
                          <span className="text-[10px] font-bold text-gray-400">
                            {mineReq === "pending"
                              ? "Очікує підтвердження"
                              : mineReq === "accepted"
                              ? "Підтверджено"
                              : mineReq === "rejected"
                              ? "Відхилено"
                              : mineReq}
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setRequestSeats(1);
                              setRequestRideModal({ rideId: r.id, ownerNickname: r.owner_nickname });
                            }}
                            disabled={actionLoading || seatsFree <= 0}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600/30 border border-emerald-500/30 text-[10px] font-bold text-emerald-200 active:scale-95 disabled:opacity-50"
                          >
                            Запит місця
                          </button>
                        )}
                      </div>
                    </div>

                    {r.isOwner && Array.isArray(r.pendingRequests) && r.pendingRequests.length > 0 && (
                      <div className="mt-3 border-t border-slate-700/50 pt-2">
                        <div className="text-[10px] text-amber-300 font-bold uppercase tracking-wider mb-1.5">
                          Запити ({r.pendingRequests.length})
                        </div>
                        <div className="space-y-1.5">
                          {r.pendingRequests.map((pr) => (
                            <div key={pr.request_id} className="flex items-center justify-between bg-slate-800/60 border border-slate-700/40 rounded-xl px-2 py-1.5">
                              <div className="text-[11px] text-gray-200">
                                {formatNick(pr.requester_nickname)} • <span className="text-gray-400">місць:</span>{" "}
                                <span className="font-semibold">{pr.seats_requested}</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => doAction(() => respondRideRequest(gameId, r.id, pr.request_id, "accept"), "Запит прийнято")}
                                  disabled={actionLoading}
                                  className="px-2 py-1 rounded-lg bg-emerald-600/60 text-[10px] font-bold text-white active:scale-95 disabled:opacity-50"
                                >
                                  Так
                                </button>
                                <button
                                  onClick={async () => {
                                    const ok = await showConfirm("Відхилити запит на місце?");
                                    if (!ok) return;
                                    doAction(
                                      () => respondRideRequest(gameId, r.id, pr.request_id, "reject"),
                                      "Запит відхилено",
                                    );
                                  }}
                                  disabled={actionLoading}
                                  className="px-2 py-1 rounded-lg bg-red-700/60 text-[10px] font-bold text-white active:scale-95 disabled:opacity-50"
                                >
                                  Ні
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {r.isOwner && Array.isArray(r.acceptedRequests) && r.acceptedRequests.length > 0 && (
                      <div className="mt-2 border-t border-slate-700/50 pt-2">
                        <div className="text-[10px] text-emerald-300 font-bold uppercase tracking-wider mb-1.5">
                          Пасажири ({r.acceptedRequests.length})
                        </div>
                        <div className="space-y-1.5">
                          {r.acceptedRequests.map((ar) => (
                            <div key={ar.request_id} className="flex items-center justify-between bg-slate-800/40 border border-slate-700/40 rounded-xl px-2 py-1.5">
                              <div className="text-[11px] text-gray-200">
                                {formatNick(ar.requester_nickname)} • <span className="text-gray-400">місць:</span>{" "}
                                <span className="font-semibold">{ar.seats_requested}</span>
                              </div>
                              <button
                                onClick={async () => {
                                  const ok = await showConfirm(
                                    `Прибрати пасажира ${formatNick(ar.requester_nickname)} з поїздки?`,
                                  );
                                  if (!ok) return;
                                  doAction(
                                    () => kickRidePassenger(gameId, r.id, ar.request_id),
                                    (resp) =>
                                      `Пасажира прибрано${
                                        resp?.passenger_notified ? "\n📣 Сповіщення надіслано" : ""
                                      }`,
                                  );
                                }}
                                disabled={actionLoading}
                                className="px-2 py-1 rounded-lg bg-red-700/40 border border-red-600/30 text-[10px] font-bold text-red-200 active:scale-95 disabled:opacity-50"
                              >
                                Kick
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ---- Ride create modal ---- */}
      {showRideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowRideModal(false)} />
          <div className="relative w-full max-w-md bg-slate-900/95 border border-emerald-500/30 rounded-3xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black text-emerald-300">Запропонувати поїздку</div>
              <button onClick={() => setShowRideModal(false)} className="text-gray-400 text-sm px-2 py-1">✕</button>
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] text-gray-400">
                Кількість місць
                <input
                  type="number"
                  min={1}
                  value={rideForm.seats_total}
                  onChange={(e) => setRideForm((s) => ({ ...s, seats_total: parseInt(e.target.value || 1) }))}
                  className="mt-1 w-full bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2 text-sm"
                />
              </label>
              <label className="block text-[11px] text-gray-400">
                Локація
                <input
                  value={rideForm.depart_location}
                  onChange={(e) => setRideForm((s) => ({ ...s, depart_location: e.target.value }))}
                  className="mt-1 w-full bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2 text-sm"
                  placeholder="Напр. метро / парковка / адреса"
                />
              </label>
              <label className="block text-[11px] text-gray-400">
                Час відправлення
                <input
                  value={rideForm.depart_time}
                  onChange={(e) => setRideForm((s) => ({ ...s, depart_time: e.target.value }))}
                  className="mt-1 w-full bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2 text-sm"
                  placeholder="Напр. 08:30"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[11px] text-gray-400">
                  Авто (марка)
                  <input
                    value={rideForm.car_make}
                    onChange={(e) => setRideForm((s) => ({ ...s, car_make: e.target.value }))}
                    className="mt-1 w-full bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2 text-sm"
                    placeholder="VW Golf"
                  />
                </label>
                <label className="block text-[11px] text-gray-400">
                  Колір
                  <input
                    value={rideForm.car_color}
                    onChange={(e) => setRideForm((s) => ({ ...s, car_color: e.target.value }))}
                    className="mt-1 w-full bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2 text-sm"
                    placeholder="сірий"
                  />
                </label>
              </div>
            </div>

            <button
              onClick={() =>
                doAction(
                  () => createGameRide(gameId, rideForm),
                  (r) =>
                    `✅ Поїздку збережено${
                      r?.passengers_notified
                        ? `\n📣 Пасажирам надіслано: ${r.passengers_notified}`
                        : ""
                    }`,
                ).then(async () => {
                  setShowRideModal(false);
                  await loadRides();
                })
              }
              disabled={actionLoading}
              className="mt-3 w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-3 rounded-2xl font-bold text-[14px] active:scale-[0.98] disabled:opacity-50"
            >
              {actionLoading ? <Spinner /> : "Зберегти"}
            </button>
          </div>
        </div>
      )}

      {/* ---- Request seats modal ---- */}
      {requestRideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setRequestRideModal(null)} />
          <div className="relative w-full max-w-md bg-slate-900/95 border border-emerald-500/30 rounded-3xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-black text-emerald-300">
                Запит місць у {formatNick(requestRideModal.ownerNickname)}
              </div>
              <button onClick={() => setRequestRideModal(null)} className="text-gray-400 text-sm px-2 py-1">✕</button>
            </div>
            <label className="block text-[11px] text-gray-400">
              Скільки місць потрібно?
              <input
                type="number"
                min={1}
                value={requestSeats}
                onChange={(e) => setRequestSeats(parseInt(e.target.value || 1))}
                className="mt-1 w-full bg-slate-800/70 border border-slate-700/50 rounded-xl px-3 py-2 text-sm"
              />
            </label>
            <button
              onClick={() =>
                doAction(
                  () => requestRideSeats(gameId, requestRideModal.rideId, requestSeats),
                  "✅ Запит відправлено",
                ).then(() => setRequestRideModal(null))
              }
              disabled={actionLoading}
              className="mt-3 w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-3 rounded-2xl font-bold text-[14px] active:scale-[0.98] disabled:opacity-50"
            >
              {actionLoading ? <Spinner /> : "Відправити запит"}
            </button>
          </div>
        </div>
      )}

      {showJoinEquipmentModal && !myRegistration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowJoinEquipmentModal(false)}
          />
          <div className="relative w-full max-w-2xl max-h-[88vh] overflow-y-auto bg-slate-900/95 border border-emerald-500/30 rounded-3xl p-4 pb-28">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-[11px] text-gray-400">Запис на гру #{g.id}</div>
                <div className="text-sm font-black text-emerald-200">
                  Обери спорядження та одразу побач суму
                </div>
              </div>
              <button
                onClick={() => setShowJoinEquipmentModal(false)}
                className="text-gray-400 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              <div className="rounded-2xl border border-slate-700/50 bg-slate-800/50 p-3">
                <div className="text-[10px] text-gray-400 uppercase tracking-wider">База</div>
                <div className="text-lg font-black text-white">{g.payment || 0} грн</div>
              </div>
              <div className="rounded-2xl border border-emerald-700/40 bg-emerald-900/20 p-3">
                <div className="text-[10px] text-emerald-300 uppercase tracking-wider">Додатково</div>
                <div className="text-lg font-black text-emerald-200">{joinAdditionalCost} грн</div>
              </div>
              <div className="rounded-2xl border border-amber-700/40 bg-amber-900/20 p-3">
                <div className="text-[10px] text-amber-300 uppercase tracking-wider">Разом</div>
                <div className="text-lg font-black text-amber-200">{joinTotalCost} грн</div>
              </div>
            </div>

            <p className="text-[11px] text-gray-400 mb-2">
              База включає форму, привід, 1 повний магазин, маску та окуляри. Основний привід обирається один.
            </p>

            <div className="pr-1 space-y-2">
              {equipmentItems.map((it) => {
                const qty = Number(joinEquipmentMap[it.item_key] || 0);
                const selectedPrimaryCount = equipmentItems.reduce((sum, x) => {
                  if (x.category !== "primary_weapon" && x.category !== "premium_weapon") return sum;
                  return sum + (Number(joinEquipmentMap[x.item_key] || 0) > 0 ? 1 : 0);
                }, 0);
                const disabledByStock = it.remaining_qty !== null && it.remaining_qty <= 0;
                const cannotPrice = it.unit_price == null;
                const disabled = it.is_disabled || disabledByStock || cannotPrice;
                const maxByStock = it.remaining_qty === null ? Infinity : it.remaining_qty;
                const maxByPlayer = it.max_per_player || Infinity;
                const maxQty = Math.max(0, Math.min(maxByStock, maxByPlayer));
                const decDisabled = qty <= 0;
                const primaryLocked =
                  (it.category === "primary_weapon" || it.category === "premium_weapon") &&
                  selectedPrimaryCount >= 1 &&
                  qty <= 0;
                const incDisabled = disabled || qty >= maxQty || primaryLocked;
                return (
                  <div key={it.item_key} className="flex items-center gap-2 rounded-2xl border border-slate-700/40 bg-slate-800/50 p-2.5">
                    <div className="w-12 h-10 rounded-lg bg-slate-900/80 overflow-hidden flex items-center justify-center border border-slate-700/40">
                      {it.image_url ? (
                        <img src={it.image_url} alt={it.title} className="w-full h-full object-contain" />
                      ) : (
                        <span>🎯</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-gray-100 truncate">{it.title}</div>
                      <div className="text-[10px] text-gray-400 truncate">
                        {it.unit_price == null ? "Ціна уточнюється" : `${it.unit_price} грн / шт`}
                        {it.remaining_qty !== null ? ` • Доступно: ${it.remaining_qty}` : " • Без ліміту"}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setJoinEquipmentMap((prev) => ({
                            ...prev,
                            [it.item_key]: Math.max(0, (Number(prev[it.item_key] || 0) - 1)),
                          }))
                        }
                        disabled={decDisabled}
                        className="w-7 h-7 rounded-lg bg-slate-700/70 text-gray-200 text-sm font-bold disabled:opacity-40"
                      >
                        −
                      </button>
                      <div className="w-8 text-center text-xs font-bold">{qty}</div>
                      <button
                        type="button"
                        onClick={() =>
                          setJoinEquipmentMap((prev) => ({
                            ...prev,
                            [it.item_key]: Math.min(maxQty, Number(prev[it.item_key] || 0) + 1),
                          }))
                        }
                        disabled={incDisabled}
                        className="w-7 h-7 rounded-lg bg-emerald-600/80 text-black text-sm font-black disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="sticky bottom-0 pt-3 bg-gradient-to-t from-slate-900 via-slate-900/95 to-transparent">
              <button
                onClick={() =>
                  doAction(async () => {
                    const equipment = Object.entries(joinEquipmentMap)
                      .map(([item_key, quantity]) => ({ item_key, quantity: Number(quantity) || 0 }))
                      .filter((x) => x.quantity > 0);
                    const res = await joinGame(gameId, { equipment });
                    if (res.waitlisted) {
                      showAlert("🕒 Гра заповнена. Тебе додано до листа очікування.");
                    } else {
                      showAlert(`✅ Записано. Орієнтовна сума: ${res.total_cost ?? g.payment} грн`);
                    }
                    setShowJoinEquipmentModal(false);
                  })
                }
                disabled={actionLoading}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-3 rounded-2xl font-bold text-[14px] active:scale-[0.98] disabled:opacity-50"
              >
                {actionLoading ? <Spinner /> : "Підтвердити запис"}
              </button>
              <div className="h-6" />
            </div>
          </div>
        </div>
      )}

      {/* ---- MVP picker modal (admin, between rounds) ---- */}
      {isAdmin && isBetweenRounds && mvpPickOpen && mvpState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setMvpPickOpen(false)}
          />
          <div className="relative w-full max-w-md bg-slate-900/95 border border-amber-500/30 rounded-3xl p-4">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="text-[11px] text-gray-400">
                  MVP Раунду {mvpState.round_number}
                </div>
                <div className="text-sm font-black text-amber-200">
                  Кого команда переможців визначає як MVP?
                </div>
                <div className="text-[11px] text-gray-400 mt-1">
                  Адмін чує рішення переможців і фіксує його тут.
                </div>
              </div>
              <button
                onClick={() => setMvpPickOpen(false)}
                className="text-gray-400 text-sm px-2 py-1"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {(mvpState.candidates || []).map((c) => {
                const selected = mvpPickSelected === c.player_id;
                return (
                  <button
                    key={c.player_id}
                    type="button"
                    onClick={() => {
                      haptic("impact");
                      setMvpPickSelected(c.player_id);
                    }}
                    className={`w-full flex items-center justify-between py-2 px-3 rounded-2xl border transition-all active:scale-[0.99] ${
                      selected
                        ? "border-amber-500/60 bg-amber-500/10"
                        : "border-slate-700/40 bg-slate-800/50 hover:bg-slate-700/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{selected ? "✅" : "🪖"}</span>
                      <span className="text-sm font-semibold">
                        {formatNick(c.nickname)}
                      </span>
                    </div>
                    <span className="text-[11px] text-gray-400">
                      Голосів:{" "}
                      <span className="font-bold text-amber-300">
                        {c.mvp_votes}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={() => setMvpPickOpen(false)}
                className="py-3 rounded-2xl bg-slate-800/70 border border-slate-700/40 text-sm font-bold text-gray-200 active:scale-[0.98]"
              >
                Пізніше
              </button>
              <button
                onClick={async () => {
                  if (!mvpPickSelected) {
                    showAlert("Обери гравця MVP зі списку.");
                    return;
                  }
                  const c = (mvpState.candidates || []).find(
                    (x) => x.player_id === mvpPickSelected,
                  );
                  const ok = await showConfirm(
                    `Підтвердити MVP: ${formatNick(c?.nickname)}?`,
                  );
                  if (!ok) return;
                  await doAction(
                    () =>
                      adminSelectMvp(
                        gameId,
                        mvpState.round_id,
                        mvpPickSelected,
                      ),
                    `✅ MVP обрано: ${formatNick(c?.nickname)}`,
                    "full",
                  );
                  setMvpPickOpen(false);
                  setMvpPickSelected(null);
                }}
                disabled={actionLoading || !mvpPickSelected}
                className="py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-sm font-black text-black shadow-lg shadow-amber-900/30 active:scale-[0.98] disabled:opacity-50"
              >
                Підтвердити
              </button>
            </div>
          </div>
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
                onClick={async () => {
                  const ok = await showConfirm(
                    "Відкрити check-in? Гравці зможуть позначитися на місці з телефону.",
                  );
                  if (!ok) return;
                  doAction(() => adminSetGameStatus(gameId, "checkin"));
                }}
                icon="📍"
                label="Відкрити Check-in"
                color="amber"
              />
            )}
            {g.status === "checkin" && (
              <SmallButton
                onClick={async () => {
                  const ok = await showConfirm(
                    "Почати гру (LIVE)? Переконайся, що готові до старту.",
                  );
                  if (!ok) return;
                  doAction(() => adminSetGameStatus(gameId, "active"));
                }}
                icon="▶️"
                label="Почати гру"
                color="red"
              />
            )}
            {g.status === "active" && (
              <SmallButton
                onClick={async () => {
                  const ok = await showConfirm(
                    "Завершити гру остаточно? Результат буде зафіксовано.",
                  );
                  if (!ok) return;
                  doAction(
                    () => adminSetGameStatus(gameId, "finished"),
                    (res) =>
                      res?.winner_message
                        ? `🏁 Гру завершено\n\n${res.winner_message}`
                        : "🏁 Гру завершено!",
                  );
                }}
                icon="🏁"
                label="Завершити гру"
                color="red"
              />
            )}
          </div>

          {/* Cancel game — keep far from frequent actions */}
          {g.status !== "finished" && g.status !== "cancelled" && (
            <div className="pt-2 mt-1 border-t border-orange-900/30">
              <button
                type="button"
                onClick={async () => {
                  const ok = await showConfirm(
                    "Скасувати гру для всіх? Цю дію не можна відмінити.",
                  );
                  if (!ok) return;
                  doAction(
                    () => adminSetGameStatus(gameId, "cancelled"),
                    "❌ Гру скасовано",
                  );
                }}
                disabled={actionLoading}
                className="w-full py-3 rounded-2xl bg-slate-800/60 border border-red-700/30 text-sm font-bold text-red-200 active:scale-[0.99] disabled:opacity-50"
              >
                ❌ Скасувати гру
              </button>
              <p className="mt-2 text-[10px] text-gray-500">
                Рекомендується використовувати лише в екстрених випадках.
              </p>
            </div>
          )}

          {/* Гравці ще без чек-іну (адмін може відмітити без телефону) */}
          {(g.status === "checkin" || g.status === "active") &&
            players.some((p) => p.attendance === "registered") && (
              <div className="mt-3 bg-slate-900/40 border border-slate-600/40 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">🪖</span>
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                    Записані, ще без check-in
                  </p>
                </div>
                <p className="text-[10px] text-gray-500 mb-2">
                  Якщо гравці вже на полі без телефону — відмітьте вручну.
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {players
                    .filter((p) => p.attendance === "registered")
                    .map((p) => (
                      <div
                        key={`reg-${p.player_id}`}
                        className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-slate-800/70"
                      >
                        <span className="text-xs font-medium">{formatNick(p.nickname)}</span>
                        <button
                          type="button"
                          onClick={() =>
                            doAction(
                              () =>
                                adminReviewCheckin(gameId, p.player_id, "confirm"),
                              "Гравця відмічено на місці",
                            )
                          }
                          className="px-2 py-1 rounded-lg bg-emerald-600/70 text-[10px] font-bold text-white active:scale-95"
                        >
                          Чекін
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}

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
                            onClick={async () => {
                              const ok = await showConfirm(
                                "Відхилити geo check-in цього гравця?",
                              );
                              if (!ok) return;
                              doAction(
                                () =>
                                  adminReviewCheckin(
                                    gameId,
                                    p.player_id,
                                    "reject",
                                  ),
                                "Check-in скасовано",
                              );
                            }}
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

          {/* Add players by Telegram @username (phone/surprise registrations) */}
          <div className="mt-2 bg-slate-900/40 border border-slate-700/40 rounded-2xl p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">➕</span>
              <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Додати по @username (з телефону)
              </p>
            </div>
            <textarea
              value={addUsersText}
              onChange={(e) => setAddUsersText(e.target.value)}
              rows={3}
              placeholder="@user1\nhttps://t.me/user2\nuser3"
              className="w-full bg-slate-800/60 border border-slate-700/40 rounded-xl p-2 text-xs text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/40"
            />
            <button
              onClick={async () => {
                try {
                  const usernames = addUsersText
                    .split(/[\s,]+/g)
                    .map((s) => s.trim())
                    .filter(Boolean);
                  if (usernames.length === 0) return;
                  await doAction(
                    () => adminAddPlayersByUsername(gameId, usernames),
                    "✅ Додано у гру",
                  );
                  setAddUsersText("");
                } catch (e) {
                  showAlert(e.message);
                  haptic("error");
                }
              }}
              disabled={actionLoading || addUsersText.trim().length === 0}
              className="mt-2 w-full bg-emerald-700/40 border border-emerald-600/30 py-2.5 rounded-xl text-sm font-bold text-emerald-200 active:scale-95 transition-transform disabled:opacity-50"
            >
              {actionLoading ? <Spinner /> : "➕ Додати в гру"}
            </button>
          </div>

          <div className="mt-2 bg-slate-900/40 border border-slate-700/40 rounded-2xl p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🧰</span>
                <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                  Наявність спорядження
                </p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setAdminEqLoading(true);
                    const s = await adminGetGameEquipmentStock(gameId);
                    setAdminEquipmentItems(s.items || []);
                  } catch {
                    setAdminEquipmentItems([]);
                  } finally {
                    setAdminEqLoading(false);
                  }
                }}
                className="px-2 py-1 rounded-lg bg-slate-800/70 text-[10px] font-bold text-gray-300"
              >
                Оновити
              </button>
            </div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto overflow-x-hidden pr-1">
              {(adminEquipmentItems || []).map((it) => (
                <div key={it.item_key} className="rounded-xl border border-slate-700/40 bg-slate-800/60 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-gray-200 truncate">{it.title}</div>
                      <div className="text-[10px] text-gray-500">
                        Бронь: {it.reserved_qty} • Залишок: {it.remaining_qty === null ? "∞" : it.remaining_qty}
                      </div>
                    </div>
                    <label className="flex items-center gap-1 text-[10px] text-gray-400">
                      Off
                      <input
                        type="checkbox"
                        checked={!!it.is_disabled}
                        onChange={(e) =>
                          setAdminEquipmentItems((prev) =>
                            prev.map((x) =>
                              x.item_key === it.item_key
                                ? { ...x, is_disabled: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                    </label>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      value={it.total_qty ?? ""}
                      onChange={(e) =>
                        setAdminEquipmentItems((prev) =>
                          prev.map((x) =>
                            x.item_key === it.item_key
                              ? {
                                  ...x,
                                  total_qty:
                                    e.target.value === "" ? "" : Number(e.target.value),
                                }
                              : x,
                          ),
                        )
                      }
                      placeholder="∞"
                      className="w-20 shrink-0 bg-slate-900/70 border border-slate-700/40 rounded-lg px-2 py-1 text-xs"
                    />
                    <input
                      type="text"
                      value={it.notes || ""}
                      onChange={(e) =>
                        setAdminEquipmentItems((prev) =>
                          prev.map((x) =>
                            x.item_key === it.item_key ? { ...x, notes: e.target.value } : x,
                          ),
                        )
                      }
                      placeholder="Примітка (напр. в ремонті)"
                      className="min-w-0 flex-1 basis-[140px] bg-slate-900/70 border border-slate-700/40 rounded-lg px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => saveAdminEquipmentItem(it)}
                      disabled={adminEqLoading}
                      className="w-full sm:w-auto px-2 py-1 rounded-lg bg-emerald-600/70 text-[10px] font-bold text-black disabled:opacity-50"
                    >
                      Зберегти
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                      {isAdmin ? "Адмін обирає MVP" : "MVP обирає адмін"}
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
                        onClick={async () => {
                          if (!isAdmin || isMine || actionLoading) return;
                          const ok = await showConfirm(
                            `Обрати MVP: ${formatNick(c.nickname)}?`,
                          );
                          if (!ok) return;
                          await doAction(
                            () =>
                              adminSelectMvp(
                                gameId,
                                mvpState.round_id,
                                c.player_id,
                              ),
                            `✅ MVP обрано: ${formatNick(c.nickname)}`,
                            "full",
                          );
                        }}
                        className={`flex items-center justify-between py-1.5 px-2 rounded-xl bg-slate-800/60 ${
                          isAdmin && !isMine ? "cursor-pointer hover:bg-slate-700/60" : ""
                        } ${isMine ? "bg-emerald-900/20" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{isMine ? "✅" : "🪖"}</span>
                          <span className="text-xs font-medium">
                            {formatNick(c.nickname)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-gray-400">
                            Голосів:{" "}
                            <span className="font-semibold text-amber-300">
                              {c.mvp_votes}
                            </span>
                          </span>
                          {isAdmin && isMine && (
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-700/60 text-gray-200 opacity-90">
                              Обраний
                            </span>
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
              {adminNeedsMvp && (
                <p className="text-xs text-amber-300/90 mb-3">
                  Спочатку обери MVP для щойно завершеного раунду.
                </p>
              )}
              {g.game_mode !== "ffa" && (
                <button
                  onClick={async () => {
                    const ok = await showConfirm(
                      "Перемішати команди випадково перед наступним раундом?",
                    );
                    if (!ok) return;
                    doAction(
                      () => adminShuffleGameTeams(gameId),
                      "🔀 Команди перемішано випадково",
                    );
                  }}
                  disabled={actionLoading}
                  className="w-full mb-2 bg-slate-700/70 border border-slate-600/40 py-3 rounded-2xl font-bold text-[14px] transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {actionLoading ? <Spinner /> : "🔀 Випадково перемішати команди"}
                </button>
              )}
              <button
                onClick={async () => {
                  const ok = await showConfirm("Почати наступний раунд?");
                  if (!ok) return;
                  doAction(() => adminStartRound(gameId));
                }}
                disabled={actionLoading || adminNeedsMvp}
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
              const alive = tPlayers.filter((p) => p.is_alive && !pendingDeadSet.has(p.player_id)).length;

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
                    {tPlayers.map((p) => {
                      const markedDead = !p.is_alive || pendingDeadSet.has(p.player_id);
                      const canToggleDead = isAdmin && p.is_alive;
                      return (
                        <div
                          key={p.player_id}
                          className={`flex items-center justify-between p-2.5 rounded-xl transition-all ${
                            markedDead ? "bg-slate-800/30 border border-slate-800/30 opacity-50" : `${tc.bg} border ${tc.border}`
                          }`}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg">{markedDead ? "💀" : "💚"}</span>
                            <span className={`text-sm font-semibold ${markedDead ? "line-through text-gray-500" : ""}`}>
                              {formatNick(p.nickname)}
                            </span>
                            {pendingDeadSet.has(p.player_id) && p.is_alive && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-700/40 text-amber-200">
                                pending
                              </span>
                            )}
                          </div>
                          {canToggleDead && (
                            <button
                              onClick={() => toggleRoundPendingDead(p.player_id, p.is_alive)}
                              className={`text-xs px-3 py-1.5 rounded-lg font-semibold active:scale-95 transition-all ${
                                pendingDeadSet.has(p.player_id)
                                  ? "bg-slate-700/70 border border-slate-600/50 text-gray-200"
                                  : "bg-red-800/60 hover:bg-red-700/60"
                              }`}
                            >
                              {pendingDeadSet.has(p.player_id) ? "↩️ Відмінити" : "💀 Вбитий"}
                            </button>
                          )}
                        </div>
                      );
                    })}
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
                  <p className="text-[11px] text-amber-200/80 mb-2">
                    Позначено вбитими: <span className="font-bold">{roundPendingKilledIds.length}</span>
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => submitRoundOutcome("A")}
                      disabled={actionLoading}
                      className="flex-1 bg-amber-700/35 border border-amber-600/35 py-2.5 rounded-xl text-sm font-bold text-amber-200 active:scale-95 transition-transform"
                    >
                      🟡 Team A
                    </button>
                    <button
                      onClick={() => submitRoundOutcome("B")}
                      disabled={actionLoading}
                      className="flex-1 bg-blue-700/40 border border-blue-600/30 py-2.5 rounded-xl text-sm font-bold text-blue-300 active:scale-95 transition-transform"
                    >
                      🔵 Team B
                    </button>
                  </div>
                  <button
                    onClick={() => submitRoundOutcome(null)}
                    disabled={actionLoading}
                    className="mt-2 w-full bg-slate-700/50 border border-slate-500/30 py-2.5 rounded-xl text-sm font-bold text-gray-300 active:scale-95 transition-transform"
                  >
                    ⚖ Нічия
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[11px] text-amber-200/80 mb-2">
                    Позначено вбитими: <span className="font-bold">{roundPendingKilledIds.length}</span>
                  </p>
                  <button
                    onClick={() => submitRoundOutcome(null)}
                    disabled={actionLoading}
                    className="w-full bg-slate-700/60 border border-slate-600/30 py-2.5 rounded-xl text-sm font-bold text-gray-300 active:scale-95 transition-transform"
                  >
                    ⏹ Завершити раунд
                  </button>
                </>
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
                  <span className="text-sm font-medium">{formatNick(p.nickname)}</span>
                  {p.game_team && (
                    <span
                      className={`ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        p.game_team === "A"
                          ? "bg-amber-500/20 text-amber-300"
                          : p.game_team === "B"
                          ? "bg-blue-500/20 text-blue-400"
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
                  <span className="text-[11px] text-gray-500 truncate max-w-[110px]">
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
                            ? "bg-amber-600 text-white"
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
                            ? "bg-blue-600 text-white"
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
                      onClick={async () => {
                        const ok = await showConfirm(
                          `Виключити ${formatNick(p.nickname)} з гри?`,
                        );
                        if (!ok) return;
                        doAction(
                          () => adminKickFromGame(gameId, p.player_id),
                          "Гравця видалено з гри",
                        );
                      }}
                      className="ml-1 px-2 py-1 rounded-lg bg-red-800/60 text-[10px] font-semibold text-red-100 active:scale-95"
                    >
                      Kick
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
              const winColor =
                r.winner_game_team === "A"
                  ? "text-amber-300"
                  : r.winner_game_team === "B"
                    ? "text-blue-400"
                    : r.status === "finished" && !r.winner_game_team
                      ? "text-amber-300/90"
                      : "text-gray-400";
              const duration = r.started_at && r.ended_at
                ? formatDuration(new Date(r.ended_at) - new Date(r.started_at))
                : r.status === "active" ? timerValue : "";
              const outcomeLabel = r.winner_game_team
                ? r.winner_game_team === "A"
                  ? "🟡 A"
                  : "🔵 B"
                : r.status === "active"
                  ? "⏳"
                  : r.status === "finished"
                    ? "⚖ Нічия"
                    : "—";
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
                      {outcomeLabel}
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

function RideModal({ value, onChange, onClose, onSubmit, submitting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3">
      <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-700/50 overflow-hidden">
        <div className="p-4 border-b border-slate-700/40 flex items-center justify-between">
          <div className="font-black">🚗 Запропонувати поїздку</div>
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-slate-800/70 border border-slate-700/40 text-xs font-bold text-gray-200 active:scale-95"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-400">
              Місць всього
              <input
                type="number"
                min={1}
                value={value.seats_total}
                onChange={(e) =>
                  onChange({
                    ...value,
                    seats_total: parseInt(e.target.value || "1", 10),
                  })
                }
                className="mt-1 w-full bg-slate-800/60 border border-slate-700/40 rounded-xl p-2 text-sm text-gray-200 focus:outline-none focus:border-emerald-500/40"
              />
            </label>
            <label className="text-xs text-gray-400">
              Час виїзду (текстом)
              <input
                value={value.depart_time}
                onChange={(e) =>
                  onChange({ ...value, depart_time: e.target.value })
                }
                placeholder="Напр. 08:30 або після роботи"
                className="mt-1 w-full bg-slate-800/60 border border-slate-700/40 rounded-xl p-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/40"
              />
            </label>
          </div>

          <label className="text-xs text-gray-400">
            Місце виїзду
            <input
              value={value.depart_location}
              onChange={(e) =>
                onChange({ ...value, depart_location: e.target.value })
              }
              placeholder="Напр. метро, ТЦ, точка збору"
              className="mt-1 w-full bg-slate-800/60 border border-slate-700/40 rounded-xl p-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/40"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-400">
              Марка авто (опц.)
              <input
                value={value.car_make}
                onChange={(e) => onChange({ ...value, car_make: e.target.value })}
                placeholder="Toyota"
                className="mt-1 w-full bg-slate-800/60 border border-slate-700/40 rounded-xl p-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/40"
              />
            </label>
            <label className="text-xs text-gray-400">
              Колір (опц.)
              <input
                value={value.car_color}
                onChange={(e) => onChange({ ...value, car_color: e.target.value })}
                placeholder="Сірий"
                className="mt-1 w-full bg-slate-800/60 border border-slate-700/40 rounded-xl p-2 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none focus:border-emerald-500/40"
              />
            </label>
          </div>

          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-3.5 rounded-2xl font-bold text-[15px] shadow-lg transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {submitting ? <Spinner /> : "✅ Опублікувати"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RideRequestButton({ disabled, maxSeats, onRequest }) {
  const [seats, setSeats] = useState(1);

  useEffect(() => {
    setSeats((s) => Math.min(Math.max(1, s), Math.max(1, maxSeats || 1)));
  }, [maxSeats]);

  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          max={Math.max(1, maxSeats || 1)}
          value={seats}
          onChange={(e) => setSeats(parseInt(e.target.value || "1", 10))}
          className="w-16 bg-slate-800/60 border border-slate-700/40 rounded-xl p-2 text-xs text-gray-200 focus:outline-none focus:border-emerald-500/40"
        />
        <button
          onClick={() => onRequest(seats)}
          disabled={disabled}
          className="px-3 py-2 rounded-xl bg-emerald-700/40 border border-emerald-600/30 text-xs font-bold text-emerald-200 active:scale-95 disabled:opacity-50"
        >
          🙋 Запит
        </button>
      </div>
      <div className="text-[10px] text-gray-500">до {Math.max(1, maxSeats || 1)}</div>
    </div>
  );
}