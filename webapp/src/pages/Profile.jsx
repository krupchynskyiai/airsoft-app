import React, { useState, useEffect } from "react";
import {
  getFriends,
  sendFriendRequest,
  respondFriendRequest,
  getLootState,
  spinLoot,
  requestUseLootReward,
  getLootEligibleGames,
} from "../api";
import PlayerSearch from "../components/PlayerSearch";
import { useTelegram } from "../hooks/useTelegram";
import { getAvatarForLevel, getPlayerLevelState } from "../utils/playerLevel";
import {
  Award,
  BadgeCheck,
  ClipboardList,
  CircleDot,
  Crosshair,
  Crown,
  Flame,
  Flag,
  Gauge,
  Gem,
  Hash,
  Heart,
  Medal,
  Moon,
  Mountain,
  PartyPopper,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Star,
  Sun,
  Swords,
  Target,
  Trophy,
  TrendingUp,
  Users,
  Zap,
  Hexagon,
  Gift,
  Send,
  Mail,
  UserPlus,
  Handshake,
  HardHat,
  Gamepad2,
  Dices,
} from "lucide-react";

const BADGE_ICONS = {
  Award,
  BadgeCheck,
  ClipboardList,
  CircleDot,
  Crosshair,
  Crown,
  Flame,
  Flag,
  Gauge,
  Gem,
  Hash,
  Heart,
  Medal,
  Moon,
  Mountain,
  PartyPopper,
  Rocket,
  Shield,
  Skull,
  Sparkles,
  Star,
  Sun,
  Swords,
  Target,
  Trophy,
  TrendingUp,
  Users,
  Zap,
  Hexagon,
};

function ProgressRing({ value, max, size = 72, stroke = 5, color = "#a3b35a" }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference - progress * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#25251d" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none"
        stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 1s ease-out" }}
      />
    </svg>
  );
}

// ---- Main Profile Component ----
export default function Profile({ profile, onReload }) {
  const ITEM_STEP_PX = 88;
  const CENTER_OFFSET_PX = 80;
  const START_CENTER_INDEX = 8;

  const { haptic, showAlert } = useTelegram();
  const [retryProfileOnce, setRetryProfileOnce] = useState(false);
  const [badgeCelebration, setBadgeCelebration] = useState(null);
  const [friendsInfo, setFriendsInfo] = useState({ friends: [], incoming: [] });
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState("");
  const [lootState, setLootState] = useState(null);
  const [lootLoading, setLootLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rollItems, setRollItems] = useState([]);
  const [rollTargetIndex, setRollTargetIndex] = useState(null);
  const [lootWinModal, setLootWinModal] = useState(null);
  const [pendingLootReward, setPendingLootReward] = useState(null);
  const [requestingRewardId, setRequestingRewardId] = useState(null);
  const [requestUseModalReward, setRequestUseModalReward] = useState(null);
  const [requestUseResultModal, setRequestUseResultModal] = useState(null);
  const [requestUseGameId, setRequestUseGameId] = useState(null);
  const [eligibleGames, setEligibleGames] = useState([]);
  const [eligibleGamesLoading, setEligibleGamesLoading] = useState(false);

  // If профіль ще не зареєстрований, спробувати один раз перезавантажити,
  // щоб дочекатися даних з Telegram / бекенду, перш ніж показувати форму.
  useEffect(() => {
    if (!profile?.registered && !retryProfileOnce) {
      setRetryProfileOnce(true);
      onReload();
    }
  }, [profile?.registered, retryProfileOnce, onReload]);

  if (!profile?.registered) {
    if (profile?.profileLoadFailed) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <p className="text-gray-300 text-sm mb-2">Не вдалося завантажити профіль</p>
          <p className="text-gray-500 text-xs mb-6">
            Відкрийте міні-ап з Telegram і перевірте з’єднання.
          </p>
          <button
            type="button"
            onClick={() => {
              onReload();
            }}
            className="px-6 py-3 rounded-lg bg-emerald-400 text-slate-950 text-sm font-bold active:scale-[0.98]"
          >
            Спробувати знову
          </button>
        </div>
      );
    }
    if (!retryProfileOnce) {
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center text-sm text-gray-400">
            Завантаження профілю...
          </div>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
        <p className="text-gray-300 text-sm mb-2">Профіль ще не готовий</p>
        <p className="text-gray-500 text-xs mb-6">
          Зазвичай він створюється автоматично з вашого Telegram. Натисніть «Оновити» або
          перезайдіть у додаток.
        </p>
        <button
          type="button"
          onClick={() => onReload()}
          className="px-6 py-3 rounded-lg bg-emerald-400 text-slate-950 text-sm font-bold active:scale-[0.98]"
        >
          Оновити
        </button>
      </div>
    );
  }

  const p = profile.player;
  const levelState = getPlayerLevelState(p.rating);
  const avatar = getAvatarForLevel(levelState.level);

  function closeLootWinModal() {
    if (pendingLootReward) {
      setLootState((prev) => ({
        ...(prev || {}),
        rewards: [
          pendingLootReward,
          ...((prev && Array.isArray(prev.rewards)) ? prev.rewards : []),
        ],
      }));
      setPendingLootReward(null);
    }
    setLootWinModal(null);
  }

  function rewardBillingMeta(reward) {
    if (!reward) return null;
    const def = (lootState?.catalog || []).find(
      (c) => c.reward_key === reward.reward_key,
    );
    return def?.billing || null;
  }

  async function openRequestUseModal(reward) {
    if (!reward?.id || reward.status !== "active") return;
    if (reward.source === "use_requested") return;
    setRequestUseModalReward(reward);
    setRequestUseGameId(null);

    const billing = rewardBillingMeta(reward);
    if (billing?.requiresGame) {
      try {
        setEligibleGamesLoading(true);
        const d = await getLootEligibleGames();
        const list = Array.isArray(d?.games) ? d.games : [];
        setEligibleGames(list);
        if (list.length === 1) setRequestUseGameId(list[0].id);
      } catch {
        setEligibleGames([]);
      } finally {
        setEligibleGamesLoading(false);
      }
    } else {
      setEligibleGames([]);
    }
  }

  async function handleRequestUseReward(reward) {
    if (!reward?.id || reward.status !== "active") return;
    if (reward.source === "use_requested") return;
    if (requestingRewardId) return;

    const billing = rewardBillingMeta(reward);
    const gameId = requestUseGameId || null;
    if (billing?.requiresGame && !gameId) {
      haptic("error");
      setRequestUseResultModal({
        title: "Оберіть гру",
        message:
          "Для цього бонусу треба обрати гру, на якій він буде застосований.",
      });
      return;
    }

    try {
      setRequestingRewardId(reward.id);
      await requestUseLootReward(reward.id, { gameId });
      setLootState((prev) => ({
        ...(prev || {}),
        rewards: (prev?.rewards || []).map((rw) =>
          rw.id === reward.id
            ? { ...rw, source: "use_requested", game_id: gameId }
            : rw,
        ),
      }));
      haptic("success");
      setRequestUseResultModal({
        title: "Запит надіслано",
        message:
          gameId
            ? "Адмін отримає запит у панелі керування. Бонус буде застосовано до обраної гри."
            : "Адмін отримає запит у панелі керування. Після підтвердження бонус буде списано.",
      });
    } catch (e) {
      haptic("error");
      setRequestUseResultModal({
        title: "Не вдалося надіслати",
        message: e.message || "Спробуй ще раз трохи пізніше.",
      });
    } finally {
      setRequestingRewardId(null);
      setRequestUseModalReward(null);
      setRequestUseGameId(null);
      setEligibleGames([]);
    }
  }

  useEffect(() => {
    async function loadFriends() {
      setFriendsLoading(true);
      setFriendsError("");
      try {
        const data = await getFriends();
        setFriendsInfo({
          friends: data.friends || [],
          incoming: data.incoming || [],
        });
      } catch (e) {
        console.error(e);
        setFriendsError("Не вдалося завантажити друзів");
      } finally {
        setFriendsLoading(false);
      }
    }

    loadFriends();
  }, []);

  // Load loot / spins state
  useEffect(() => {
    async function loadLoot() {
      try {
        const s = await getLootState();
        setLootState(s);
      } catch (e) {
        console.error("Loot state error", e);
      }
    }
    loadLoot();
  }, []);

  async function handleRespondFriend(requestId, action) {
    try {
      setFriendsError("");
      await respondFriendRequest(requestId, action);
      haptic("success");
      const data = await getFriends();
      setFriendsInfo({
        friends: data.friends || [],
        incoming: data.incoming || [],
      });
    } catch (e) {
      console.error(e);
      setFriendsError(e.message || "Помилка обробки запиту");
      haptic("error");
    }
  }

  useEffect(() => {
    if (!p?.id || !Array.isArray(profile.badges) || profile.badges.length === 0) {
      return;
    }

    try {
      const storageKey = `seen_badges_${p.id}`;
      const raw = window.localStorage.getItem(storageKey);
      const seen = raw ? JSON.parse(raw) : [];

      const allNames = profile.badges.map((b) => b.badge_name);
      const newNames = allNames.filter((name) => !seen.includes(name));

      if (newNames.length > 0) {
        const firstNew = newNames[0];
        const badge = profile.badges.find((b) => b.badge_name === firstNew);

        haptic("success");
        setBadgeCelebration({
          name: badge?.badge_name || firstNew,
          color: badge?.badge_color || "#ddb85e",
          description: badge?.badge_description || "",
          icon: badge?.badge_icon || "",
        });

        const updated = Array.from(new Set([...seen, ...newNames]));
        window.localStorage.setItem(storageKey, JSON.stringify(updated));
      }
    } catch {
      // ignore storage errors
    }
  }, [p?.id, profile.badges, haptic]);

  useEffect(() => {
    if (!badgeCelebration) return;
    const t = setTimeout(() => setBadgeCelebration(null), 4500);
    return () => clearTimeout(t);
  }, [badgeCelebration]);
  const winRate = p.games_played > 0 ? Math.round((p.wins / p.games_played) * 100) : 0;
  const roundsPlayed = profile.roundStats?.rounds_played ?? 0;
  const roundsSurvived = profile.roundStats?.rounds_survived ?? 0;
  const rawSurvivalRate = roundsPlayed > 0
    ? Math.round((roundsSurvived / roundsPlayed) * 100)
    : 0;
  const survivalRate = Math.max(0, Math.min(100, rawSurvivalRate));

  return (
    <div className="relative min-h-screen pb-8">
      {/* ---- Badge celebration popup ---- */}
      {badgeCelebration && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />
          <style>{`
            @keyframes badgeReveal {
              0% { transform: scale(0.6); opacity: 0; }
              60% { transform: scale(1.06); opacity: 1; }
              100% { transform: scale(1); opacity: 1; }
            }
          `}</style>

          <div className="relative z-50 w-[84%] max-w-sm overflow-hidden rounded-2xl bg-slate-900 border border-slate-600/60 text-center">
            <span className="absolute inset-x-0 top-0 h-[3px]" style={{ backgroundColor: badgeCelebration.color }} />
            <div className="px-5 pt-6 pb-5">
              <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-4">
                Новий бейдж
              </div>
              {(() => {
                const CelebrationIcon = BADGE_ICONS[badgeCelebration.icon] || Award;
                return (
                  <div
                    className="mx-auto mb-4 w-20 h-20 rounded-lg flex items-center justify-center border-2 bg-slate-950/70"
                    style={{
                      borderColor: badgeCelebration.color,
                      animation: "badgeReveal 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
                    }}
                  >
                    <CelebrationIcon size={36} color={badgeCelebration.color} strokeWidth={2} />
                  </div>
                );
              })()}
              <h3 className="font-display text-2xl font-bold uppercase tracking-wide text-gray-100 mb-2">
                {badgeCelebration.name}
              </h3>
              {badgeCelebration.description ? (
                <p className="text-xs text-gray-300 mb-5 leading-relaxed px-1">
                  {badgeCelebration.description}
                </p>
              ) : (
                <p className="text-xs text-gray-400 mb-5">
                  Продовжуй у тому ж дусі, щоб відкрити ще більше нагород.
                </p>
              )}
              <button
                onClick={() => setBadgeCelebration(null)}
                className="w-full py-2.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold uppercase tracking-wider active:scale-[0.98] transition-transform"
              >
                Круто!
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ---- Loot win modal ---- */}
      {lootWinModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative z-50 w-[84%] max-w-sm px-5 py-6 rounded-2xl bg-slate-900 border border-slate-600/60 text-center">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-300 mb-3">
              Вітаємо з виграшем!
            </div>

            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg mb-3 bg-slate-950/60 border border-slate-700/60 text-left">
              <div
                className="w-16 h-12 rounded bg-slate-900/80 shrink-0 overflow-hidden flex items-center justify-center border"
                style={{
                  borderColor: lootWinModal.color || "rgba(148,163,184,0.5)",
                }}
              >
                {lootWinModal.imageUrl ? (
                  <img
                    src={lootWinModal.imageUrl}
                    alt={lootWinModal.title}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <Gift className="w-5 h-5 text-gray-500" strokeWidth={2} />
                )}
              </div>
              <span className="font-display text-lg font-bold uppercase tracking-wide text-gray-100">
                {lootWinModal.title}
              </span>
            </div>

            {lootWinModal.description ? (
              <p className="text-xs text-gray-300 mb-4 leading-relaxed px-1">
                {lootWinModal.description}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mb-4">
                Нагорода додана у розділ «Бонуси».
              </p>
            )}

            <button
              onClick={closeLootWinModal}
              className="w-full py-2.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold uppercase tracking-wider active:scale-[0.98] transition-transform"
            >
              Забрати
            </button>
          </div>
        </div>
      )}
      {requestUseModalReward && (() => {
        const billing = rewardBillingMeta(requestUseModalReward);
        const requiresGame = !!billing?.requiresGame;
        const def = (lootState?.catalog || []).find(
          (c) => c.reward_key === requestUseModalReward.reward_key,
        );
        const noEligible =
          requiresGame && !eligibleGamesLoading && eligibleGames.length === 0;
        const canSubmit =
          !requestingRewardId &&
          (!requiresGame || (requestUseGameId && !eligibleGamesLoading));
        return (
          <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-black/70" />
            <div className="relative z-50 w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-600/60 p-5 text-center">
              <div className="mx-auto mb-3 w-10 h-10 rounded-lg bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center">
                <Send className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              </div>
              <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gray-100 mb-2">
                Запит на використання
              </h3>
              <p className="text-xs text-gray-300 mb-1">
                Надіслати адміну запит для бонуса:
              </p>
              <p className="text-sm font-bold text-emerald-300 mb-4">
                {def?.title || requestUseModalReward.reward_key}
              </p>

              {requiresGame && (
                <div className="text-left mb-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-300 mb-2">
                    Обери гру
                  </div>
                  {eligibleGamesLoading ? (
                    <div className="text-xs text-gray-500">Завантаження...</div>
                  ) : noEligible ? (
                    <div className="text-xs text-amber-300">
                      Немає ігор, на які ти зареєстрований(а). Запишись на гру
                      і спробуй знову.
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {eligibleGames.map((g) => {
                        const active = requestUseGameId === g.id;
                        return (
                          <button
                            key={g.id}
                            type="button"
                            onClick={() => setRequestUseGameId(g.id)}
                            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left ${
                              active
                                ? "bg-emerald-400/10 border-emerald-400/50 text-emerald-200"
                                : "bg-slate-800/70 border-slate-700/50 text-gray-200"
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold truncate">
                                #{g.id} · {g.date} {g.time || ""}
                              </div>
                              <div className="text-[10px] text-gray-400 truncate">
                                {g.location || "—"}
                              </div>
                            </div>
                            <div className="font-mono text-[10px] uppercase tracking-wider text-gray-400 shrink-0">
                              {g.status}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setRequestUseModalReward(null);
                    setRequestUseGameId(null);
                    setEligibleGames([]);
                  }}
                  className="py-2.5 rounded-lg bg-slate-800 border border-slate-600/60 text-gray-200 text-xs font-semibold active:scale-[0.98]"
                >
                  Скасувати
                </button>
                <button
                  type="button"
                  onClick={() => handleRequestUseReward(requestUseModalReward)}
                  disabled={!canSubmit}
                  className="py-2.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold active:scale-[0.98] disabled:opacity-50"
                >
                  {requestingRewardId ? "Надсилання..." : "Надіслати"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
      {requestUseResultModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative z-50 w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-600/60 p-5 text-center">
            <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gray-100 mb-2">{requestUseResultModal.title}</h3>
            <p className="text-xs text-gray-400 mb-4">{requestUseResultModal.message}</p>
            <button
              type="button"
              onClick={() => setRequestUseResultModal(null)}
              className="w-full py-2.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold active:scale-[0.98]"
            >
              ОК
            </button>
          </div>
        </div>
      )}
      {/* ---- Hero card with avatar ---- */}
      <div className="relative mb-6 rounded-3xl overflow-hidden border border-slate-600/50">
        <div className="camo absolute inset-0" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-950/55 to-slate-950/85" />

        <div className="relative px-5 pt-6 pb-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              <div
                className={`w-[72px] h-[72px] rounded-2xl flex items-center justify-center shadow-lg border border-white/15 bg-slate-950/70 bg-gradient-to-br ${avatar.bg}`}
                style={{ boxShadow: `0 20px 60px ${avatar.ring}22` }}
              >
                {avatar.emoji}
              </div>
              <div className="absolute -bottom-1.5 -right-1.5 bg-amber-400 text-slate-950 font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shadow-md">
                LV{levelState.level}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display text-[26px] font-bold uppercase tracking-wide truncate leading-tight">{p.callsign || p.nickname}</h1>
              <p className="font-mono text-[11px] uppercase tracking-wider text-gray-300">#{String(p.id).padStart(3, "0")} • {p.team || "Соло Гравець"}</p>
            </div>
          </div>

          {/* Rating */}
          <div className="flex items-center gap-4 bg-slate-950/60 rounded-xl py-3.5 px-4 border border-white/10">
            <div className="relative flex items-center justify-center">
              <ProgressRing
                value={levelState.progress}
                max={levelState.span}
                size={64}
                stroke={4}
                color={avatar.ring}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-black">{p.rating}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Рейтинг</div>
              <div className="text-[13px] text-gray-200">
                Далі: {levelState.pointsToNext} до рівня {levelState.nextLevel}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Quick stats row ---- */}
      <div className="grid grid-cols-4 gap-2 mb-5">
        <QuickStat value={p.games_played} label="Ігор" />
        <QuickStat value={p.wins} label="Перемог" accent />
        <QuickStat value={`${winRate}%`} label="Вінрейт" />
        <QuickStat value={p.mvp_count} label="MVP" accent />
      </div>

      {/* ---- Combat stats card ---- */}
      <div className="bg-slate-900/80 rounded-2xl p-4 mb-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <Swords className="w-4 h-4 text-emerald-300" />
          <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Статистика боїв</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <CombatStat icon={Skull} value={p.total_deaths} label="Смертей" color="text-red-300" />
          <CombatStat icon={Shield} value={`${survivalRate}%`} label="Виживань" color="text-emerald-300" />
        </div>

        {/* Survival Rate bar */}
        <div className="mt-1 mb-1">
          <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            <span className="font-semibold">Виживання, %</span>
            <span className={`font-bold ${
              survivalRate >= 70 ? "text-emerald-300" : survivalRate >= 40 ? "text-amber-300" : "text-red-300"
            }`}>{survivalRate}%</span>
          </div>
          <div className="relative h-1.5 bg-slate-800 rounded-sm overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-sm transition-all duration-1000 ${
                survivalRate >= 70
                  ? "bg-emerald-400"
                  : survivalRate >= 40
                    ? "bg-amber-400"
                    : "bg-red-400"
              }`}
              style={{ width: `${survivalRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* ---- Badges ---- */}
      {profile.badges?.length > 0 && (
        <div className="bg-slate-900/80 rounded-2xl p-4 mb-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Medal className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Нагороди
              </h3>
            </div>
            <span className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-400">
              {profile.badges.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.badges.map((b, i) => {
              const LucideBadgeIcon = BADGE_ICONS[b.badge_icon] || null;
              const IconComponent = LucideBadgeIcon || Award;
              const rawBadgeEmoji = (b.badge_emoji || "").trim();
              // Для старих записів badge_emoji інколи містить текст (напр. "Users"),
              // тому показуємо emoji лише якщо це не звичайний текстовий slug.
              const badgeEmoji =
                rawBadgeEmoji && !/^[A-Za-z0-9_ -]+$/.test(rawBadgeEmoji)
                  ? rawBadgeEmoji
                  : "";
              const desc =
                b.badge_description ||
                "Опис нагороди з’явиться після оновлення профілю.";
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    haptic("impact");
                    showAlert(`${b.badge_name}\n\n${desc}`);
                  }}
                  className="group relative pl-1 pr-3 py-1 rounded-lg border bg-slate-950/50 transition-colors active:scale-[0.98] text-left cursor-pointer"
                  style={{
                    borderColor: `${b.badge_color}55`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded flex items-center justify-center shrink-0 border"
                      style={{ backgroundColor: `${b.badge_color}1f`, borderColor: `${b.badge_color}40` }}
                    >
                      {badgeEmoji && !LucideBadgeIcon ? (
                        <span className="text-sm leading-none">{badgeEmoji}</span>
                      ) : (
                        <IconComponent
                          size={16}
                          color={b.badge_color}
                          strokeWidth={2}
                        />
                      )}
                    </div>
                    <span className="text-xs font-semibold text-gray-200">
                      {b.badge_name}
                    </span>
                  </div>
                  <span className="sr-only">Натисни, щоб прочитати за що нагорода</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Колесо фортуни ---- */}
      {lootState && (
        <div className="bg-slate-900/80 rounded-2xl p-4 mb-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Dices className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Колесо фортуни
              </h3>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">
              Доступні оберти:{" "}
              <span className="font-bold text-emerald-300">
                {lootState.remainingSpins}
              </span>
            </span>
          </div>

          {/* Смуга кейсів у стилі CS:GO */}
          <div className="relative h-20 bg-slate-950/70 rounded-lg overflow-hidden border border-slate-700/60 mb-3">
            <div className="absolute inset-y-0 left-1/2 w-[2px] bg-emerald-400 z-20" />
            {/* Контур активного айтема по центру */}
            <div className="pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-[88px] rounded border-2 border-emerald-400/80 z-10" />
            <div
              className="absolute inset-y-0 left-1/2 flex items-center"
              style={{
                transform:
                  spinning && rollTargetIndex != null
                    ? `translateX(-${rollTargetIndex * ITEM_STEP_PX + CENTER_OFFSET_PX}px)`
                    : `translateX(-${START_CENTER_INDEX * ITEM_STEP_PX + CENTER_OFFSET_PX}px)`,
                transition:
                  spinning && rollTargetIndex != null
                    ? "transform 5s cubic-bezier(0.16, 1, 0.3, 1)"
                    : "none",
              }}
            >
              <div className="flex gap-2 px-10">
                {(() => {
                  // Стрічка показує уніфікований набір усіх можливих типів призів:
                  // поєднуємо каталог + типи виграних нагород, щоб була візуальна різноманітність.
                  const catalogList = Array.isArray(lootState.catalog)
                    ? lootState.catalog
                    : [];
                  const rewardTypeList = Array.isArray(lootState.rewards)
                    ? lootState.rewards.map((rw) => ({
                        reward_key: rw.reward_key,
                        rarity: rw.rarity,
                        image_url: rw.image_url,
                      }))
                    : [];
                  const byKey = new Map();
                  for (const item of catalogList) {
                    if (!item?.reward_key) continue;
                    byKey.set(item.reward_key, item);
                  }
                  for (const item of rewardTypeList) {
                    if (!item?.reward_key) continue;
                    if (!byKey.has(item.reward_key)) {
                      byKey.set(item.reward_key, item);
                    }
                  }
                  const baseStatic = Array.from(byKey.values());
                  const sourceList = rollItems.length ? rollItems : baseStatic;
                  const list = [];
                  if (rollItems.length) {
                    // Під час анімації використовуємо довгу послідовність rollItems:
                    // це вже згенерована смуга з багатьох айтемів перед виграшем.
                    list.push(...sourceList);
                  } else {
                    // У статиці робимо стрічку дуже довгою за рахунок багаторазового повторення каталогу.
                    for (let k = 0; k < 10; k++) {
                      list.push(...sourceList);
                    }
                  }
                  return list.map((rw, idx) => {
                    const catalogDef =
                      (lootState.catalog || []).find(
                        (c) =>
                          (c.reward_key || c.key) ===
                          (rw.reward_key || rw.key),
                      ) || null;
                    const rarityKey = catalogDef?.rarity || rw.rarity;
                    const rarityColor =
                      lootState.rarities?.[rarityKey]?.color ||
                      "rgba(148,163,184,0.6)";
                    const rawUrl =
                      catalogDef?.image_url || rw.image_url || "";
                    const imgUrl = rawUrl.startsWith("./")
                      ? rawUrl.replace("./", "/")
                      : rawUrl;
                    const displayTitle =
                      catalogDef?.title ||
                      rw.title ||
                      rw.reward_key ||
                      rw.key;
                    return (
                      <div
                        key={`${rw.key || rw.reward_key}_${idx}`}
                        className="w-20 h-16 rounded flex flex-col items-center justify-center text-[10px] font-semibold text-gray-100 bg-slate-800/80 border"
                        style={{ borderColor: rarityColor }}
                      >
                        <div className="w-12 h-8 rounded-sm bg-slate-900/80 mb-1 overflow-hidden flex items-center justify-center">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                            alt={displayTitle}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <Gift className="w-4 h-4 text-gray-500" strokeWidth={2} />
                          )}
                        </div>
                        <span className="truncate max-w-[70px]">
                          {displayTitle}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          <button
            type="button"
            disabled={spinning || lootLoading || lootState.remainingSpins <= 0}
            onClick={async () => {
              if (spinning || lootLoading || lootState.remainingSpins <= 0) return;
              try {
                setSpinning(true);
                setLootLoading(true);
                haptic("impact");
                const res = await spinLoot();
                const reward = res.reward;

                // Побудувати стрічку: багато випадкових айтемів + гарантований виграшний у кінці
                const staticPool =
                  lootState.catalog && lootState.catalog.length > 0
                    ? lootState.catalog
                    : lootState.rewards || [];
                const basePool = staticPool.concat([
                  {
                    reward_key: reward.key,
                    title: reward.title,
                    rarity: reward.rarity,
                    image_url: reward.image_url,
                  },
                ]);
                const items = [];
                const beforeCount = 80;
                const afterCount = 24;

                // Довга стрічка перед виграшем
                for (let i = 0; i < beforeCount; i++) {
                  const rnd = basePool[Math.floor(Math.random() * basePool.length)];
                  items.push(rnd);
                }
                const winIndex = items.length;
                items.push({
                  reward_key: reward.key,
                  title: reward.title,
                  rarity: reward.rarity,
                  image_url: reward.image_url,
                });
                // І ще хвіст після виграшу, щоб не було "пустоти" справа
                for (let i = 0; i < afterCount; i++) {
                  const rnd = basePool[Math.floor(Math.random() * basePool.length)];
                  items.push(rnd);
                }

                setRollItems(items);
                setRollTargetIndex(winIndex);
                setLootState((prev) => ({
                  ...(prev || {}),
                  ...res.state,
                }));

                setTimeout(() => {
                  haptic("success");
                  const rawImageUrl = reward.image_url || "";
                  const imageUrl = rawImageUrl.startsWith("./")
                    ? rawImageUrl.replace("./", "/")
                    : rawImageUrl;
                  setPendingLootReward({
                    id: reward.id,
                    reward_key: reward.key,
                    rarity: reward.rarity,
                    image_url: reward.image_url,
                    status: "active",
                    source: "spin",
                  });
                  setLootWinModal({
                    title: reward.title || reward.key,
                    description: reward.description || "",
                    imageUrl,
                    color:
                      lootState?.rarities?.[reward.rarity]?.color ||
                      "rgba(148,163,184,0.6)",
                  });
                  setSpinning(false);
                  // Після завершення анімації повертаємо колесо до базового каталогу
                  setRollItems([]);
                }, 5200);
              } catch (e) {
                showAlert(e.message);
                haptic("error");
                setSpinning(false);
              } finally {
                setLootLoading(false);
              }
            }}
            className="w-full bg-emerald-400 text-slate-950 py-3 rounded-lg font-bold text-[14px] uppercase tracking-wider active:scale-[0.98] disabled:opacity-50"
          >
            {spinning || lootLoading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                Крутиться...
              </span>
            ) : lootState.remainingSpins > 0 ? (
              <span className="inline-flex items-center gap-2">
                <Dices className="w-4 h-4" strokeWidth={2} />
                Крутити
              </span>
            ) : (
              "Немає обертів"
            )}
          </button>

          <p className="mt-2 text-[10px] text-gray-500">
            1 оберт / 50 рейтингу + 1 безкоштовний при реєстрації. Нагороди
            погоджуються з адміністратором.
          </p>
        </div>
      )}

      {/* ---- Бонуси (виграні нагороди) ---- */}
      {lootState && (lootState.rewards || []).length > 0 && (
        <div className="bg-slate-900/80 rounded-2xl p-4 mb-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gift className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Бонуси
              </h3>
            </div>
            <span className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-400">
              {(lootState.rewards || []).length}
            </span>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
            {(lootState.rewards || []).map((rw) => {
              const def =
                (lootState.catalog || []).find(
                  (c) => c.reward_key === rw.reward_key,
                ) || null;
              const title = def?.title || rw.reward_key;
              const description = def?.description || "";
              const rawImageUrl = def?.image_url || rw.image_url || "";
              const imageUrl = rawImageUrl.startsWith("./")
                ? rawImageUrl.replace("./", "/")
                : rawImageUrl;
              const rarityColor =
                lootState.rarities?.[rw.rarity]?.color || "rgba(148,163,184,0.6)";
              const isActive = rw.status === "active";
              const isRequested = rw.source === "use_requested";
              const isRequesting = requestingRewardId === rw.id;
              return (
                <div
                  key={rw.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-950/50 border border-slate-700/60"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold overflow-hidden bg-slate-900/80"
                      style={{
                        border: `1px solid ${rarityColor}`,
                      }}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={title}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Gift className="w-4 h-4 text-gray-500" strokeWidth={2} />
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-gray-100">
                        {title}
                      </span>
                      {description && (
                        <span className="text-[10px] text-gray-400 truncate max-w-[180px]">
                          {description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider ${
                        isActive
                          ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
                          : "text-gray-400 border-slate-600/50 bg-slate-700/30"
                      }`}
                    >
                      {isActive ? "Активний" : "Використано"}
                    </span>
                    {/* <span className="text-[9px] text-gray-500">
                      {rw.rarity}
                    </span> */}
                    {isActive && (
                      <button
                        type="button"
                        onClick={() => openRequestUseModal(rw)}
                        disabled={!!requestingRewardId || isRequested}
                        className={`text-[10px] font-bold px-2 py-1 rounded border active:scale-[0.98] disabled:opacity-50 ${
                          isRequested
                            ? "bg-slate-800 text-gray-400 border-slate-600/60"
                            : "bg-amber-400/10 text-amber-300 border-amber-400/40"
                        }`}
                      >
                        {isRequested
                          ? "Очікує адміна"
                          : isRequesting
                            ? "Надсилання..."
                            : "Використати"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Friends ---- */}
      <div className="bg-slate-900/80 rounded-2xl p-4 mb-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Handshake className="w-5 h-5 text-emerald-300" strokeWidth={2} />
            <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">
              Друзі
            </h3>
          </div>
          <span className="rounded border border-slate-600/50 bg-slate-800/60 px-2 py-0.5 font-mono text-[10px] font-bold text-gray-400">
            {friendsInfo.friends.length}
          </span>
        </div>

        {/* Add friend using PlayerSearch */}
        <div className="mb-3">
          <PlayerSearch
            placeholder="Запросити друга"
            icon={<UserPlus className="w-4 h-4 text-gray-500" strokeWidth={2} />}
            onSelect={async (player) => {
              try {
                setFriendsError("");
                await sendFriendRequest(player.nickname);
                haptic("success");
                showAlert(`Запит у друзі надіслано для ${player.nickname}`);
                const data = await getFriends();
                setFriendsInfo({
                  friends: data.friends || [],
                  incoming: data.incoming || [],
                });
              } catch (e) {
                console.error(e);
                setFriendsError(e.message || "Помилка запиту в друзі");
                haptic("error");
                showAlert(e.message || "Помилка запиту в друзі");
              }
            }}
          />
        </div>

        {friendsError && (
          <div className="mb-2 text-[11px] text-red-400">
            {friendsError}
          </div>
        )}

        {/* Friends list */}
        {friendsInfo.friends.length === 0 ? (
          <p className="text-xs text-gray-500 mb-3">
            Додай друзів, щоб бачити, коли вони записані на гру.
          </p>
        ) : (
          <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1 mb-3">
            {friendsInfo.friends.map((f) => (
              <div
                key={f.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-950/50 border border-slate-700/40"
              >
                <div className="flex items-center gap-2">
                  <HardHat className="w-4 h-4 text-gray-500" strokeWidth={2} />
                  <span className="text-xs font-medium">{f.callsign || f.nickname}</span>
                </div>
                <span className="inline-flex items-center gap-1 font-mono text-[10px] text-gray-400">
                  <Star className="w-3 h-3 text-amber-300" strokeWidth={2} />
                  {f.rating}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Incoming friend requests */}
        <div className="border-t border-slate-700/60 pt-2 mt-1">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] text-gray-400 uppercase tracking-wider">
              Вхідні запити
            </span>
            {friendsInfo.incoming.length > 0 && (
              <span className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
                {friendsInfo.incoming.length}
              </span>
            )}
          </div>

          {friendsLoading && friendsInfo.incoming.length === 0 ? (
            <p className="text-[11px] text-gray-500">Завантаження...</p>
          ) : friendsInfo.incoming.length === 0 ? (
            <p className="text-[11px] text-gray-500">
              Немає нових запитів.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
              {friendsInfo.incoming.map((r) => (
                <div
                  key={r.request_id || r.id}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-950/50 border border-slate-700/40"
                >
                  <div className="flex items-center gap-2">
                    <Mail className="w-4 h-4 text-gray-500" strokeWidth={2} />
                    <span className="text-xs font-medium">
                      {r.callsign || r.from_nickname || r.nickname}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        handleRespondFriend(r.request_id || r.id, "accept")
                      }
                      className="px-2 py-1 rounded bg-emerald-400 text-[10px] font-bold text-slate-950 active:scale-[0.98]"
                    >
                      Прийняти
                    </button>
                    <button
                      onClick={() =>
                        handleRespondFriend(r.request_id || r.id, "reject")
                      }
                      className="px-2 py-1 rounded bg-slate-800 border border-slate-600/60 text-[10px] font-bold text-gray-200 active:scale-[0.98]"
                    >
                      Відхилити
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Recent games ---- */}
      {profile.recentGames?.length > 0 && (
        <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">Історія ігор</h3>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">{profile.recentGames.length} ігор</span>
          </div>

          <div className="space-y-2">
            {profile.recentGames.map((g) => {
              const isFinished = g.status === "finished";
              const resolvedResult = g.resolved_result || g.result;
              const isWin = isFinished && resolvedResult === "win";
              const isLoss = isFinished && resolvedResult === "loss";
              const isDraw = isFinished && resolvedResult === "draw";

              const badgeBg = isFinished
                ? isWin
                  ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
                  : isLoss
                  ? "text-red-300 border-red-400/30 bg-red-400/10"
                  : isDraw
                  ? "text-amber-300 border-amber-400/30 bg-amber-400/10"
                  : "text-gray-300 border-slate-600/50 bg-slate-700/30"
                : "text-gray-300 border-slate-600/50 bg-slate-700/30";

              const cardBg = isFinished
                ? isWin
                  ? "bg-slate-950/50 border-emerald-400/20"
                  : isLoss
                  ? "bg-slate-950/50 border-red-400/20"
                  : isDraw
                  ? "bg-slate-950/50 border-amber-400/20"
                  : "bg-slate-950/50 border-slate-700/50"
                : "bg-slate-950/50 border-slate-700/50";

              let labelText = "В ПРОЦЕСІ";
              if (isFinished) {
                labelText = isWin
                  ? "ПЕРЕМОГА"
                  : isLoss
                  ? "ПОРАЗКА"
                  : isDraw
                  ? "НІЧИЯ"
                  : "ЗАВЕРШЕНО";
              } else if (g.status === "checkin") {
                labelText = "CHECK-IN";
              } else if (g.status === "upcoming") {
                labelText = "ЗАПЛАНОВАНА";
              }

              return (
                <div
                  key={g.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${cardBg}`}
                >
                  <div
                    className={`w-10 h-10 rounded border flex items-center justify-center font-mono text-sm font-bold ${badgeBg}`}
                  >
                    {isFinished ? (isWin ? "W" : isLoss ? "L" : isDraw ? "D" : "—") : "•"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Гра #{g.id}</span>
                      <span className="rounded border border-slate-600/50 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-gray-400">
                        {g.game_mode === "team_vs_team"
                          ? "TvT"
                          : g.game_mode === "random_teams"
                          ? "Random"
                          : "FFA"}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-gray-500">{g.date}</span>
                  </div>

                  <div className="text-right">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-gray-300">
                      {labelText}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!profile.recentGames?.length && (
        <div className="bg-slate-900/60 rounded-2xl p-8 text-center border border-slate-700/50 border-dashed">
          <Crosshair className="w-10 h-10 mx-auto mb-3 text-slate-500" strokeWidth={1.5} />
          <p className="text-gray-400 text-sm">Ще немає ігор</p>
          <p className="text-gray-500 text-xs mt-1">Запишись на гру щоб почати</p>
        </div>
      )}
    </div>
  );
}

// ---- Sub-components ----

function QuickStat({ value, label, accent }) {
  return (
    <div className="bg-slate-900/80 rounded-lg p-2.5 text-center border border-slate-700/50">
      <div className={`font-mono text-lg font-bold ${accent ? "text-emerald-300" : "text-gray-100"}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{label}</div>
    </div>
  );
}

function CombatStat({ icon: Icon, value, label, color }) {
  return (
    <div className="text-center rounded-lg bg-slate-950/50 border border-slate-700/40 py-3">
      <Icon className="w-5 h-5 mx-auto mb-1 text-gray-500" strokeWidth={2} />
      <div className={`font-mono text-xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}
