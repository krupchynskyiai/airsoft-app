import React, { useState, useEffect } from "react";
import { getFriends, sendFriendRequest, respondFriendRequest, getLootState, spinLoot, requestUseLootReward } from "../api";
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

// ---- Animated background particles (decorative) ----
function FloatingParticles() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full opacity-10"
          style={{
            width: `${20 + i * 15}px`,
            height: `${20 + i * 15}px`,
            background: `radial-gradient(circle, ${i % 2 === 0 ? "#10b981" : "#06b6d4"}, transparent)`,
            top: `${10 + i * 14}%`,
            left: `${5 + i * 16}%`,
            animation: `float${i % 3} ${4 + i * 0.7}s ease-in-out infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes float0 { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-12px) scale(1.1); } }
        @keyframes float1 { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-8px) rotate(5deg); } }
        @keyframes float2 { 0%,100% { transform: translateX(0); } 50% { transform: translateX(10px); } }
      `}</style>
    </div>
  );
}

// ---- Circular progress ring ----
function ProgressRing({ value, max, size = 72, stroke = 5, color = "#10b981" }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = circumference - progress * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1e293b" strokeWidth={stroke} />
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
            className="px-6 py-3 rounded-xl bg-emerald-700/50 border border-emerald-600/40 text-emerald-100 text-sm font-semibold active:scale-95"
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
          className="px-6 py-3 rounded-xl bg-emerald-700/50 border border-emerald-600/40 text-emerald-100 text-sm font-semibold active:scale-95"
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

  async function handleRequestUseReward(reward) {
    if (!reward?.id || reward.status !== "active") return;
    if (reward.source === "use_requested") return;
    if (requestingRewardId) return;

    try {
      setRequestingRewardId(reward.id);
      await requestUseLootReward(reward.id);
      setLootState((prev) => ({
        ...(prev || {}),
        rewards: (prev?.rewards || []).map((rw) =>
          rw.id === reward.id ? { ...rw, source: "use_requested" } : rw,
        ),
      }));
      haptic("success");
      setRequestUseResultModal({
        title: "Запит надіслано",
        message:
          "Адмін отримає запит у панелі керування. Після підтвердження бонус буде списано.",
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
          color: badge?.badge_color || "#fbbf24",
          description: badge?.badge_description || "",
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
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          {/* Confetti */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(30)].map((_, i) => {
              const fromLeft = i % 2 === 0;
              const delay = (i % 10) * 0.15;
              const top = 5 + (i * 7) % 90;
              const size = 6 + (i % 4) * 2;
              return (
                <span
                  key={i}
                  className="absolute rounded-full opacity-90"
                  style={{
                    width: `${size}px`,
                    height: `${size * 0.4}px`,
                    background:
                      i % 3 === 0
                        ? "#22c55e"
                        : i % 3 === 1
                          ? "#06b6d4"
                          : "#eab308",
                    top: `${top}%`,
                    left: fromLeft ? "-5%" : "105%",
                    animation: `${fromLeft ? "confettiLeft" : "confettiRight"} 1.6s ease-out ${delay}s forwards`,
                  }}
                />
              );
            })}
            <style>{`
              @keyframes confettiLeft {
                0% { transform: translateX(0) rotate(0deg); opacity: 1; }
                100% { transform: translateX(140vw) rotate(420deg); opacity: 0; }
              }
              @keyframes confettiRight {
                0% { transform: translateX(0) rotate(0deg); opacity: 1; }
                100% { transform: translateX(-140vw) rotate(-420deg); opacity: 0; }
              }
            `}</style>
          </div>

          <div className="relative z-50 w-[84%] max-w-sm px-5 py-6 rounded-3xl bg-slate-900/95 border border-emerald-400/40 shadow-2xl shadow-emerald-900/60 text-center">
            <div className="mb-2 text-4xl">🎉</div>
            <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-[0.2em] mb-2">
              Новий бейдж
            </h3>
            <div
              className="inline-flex items-center justify-center px-4 py-2 rounded-2xl mb-3"
              style={{
                background: `linear-gradient(135deg, ${badgeCelebration.color}33, ${badgeCelebration.color}11)`,
                border: `1px solid ${badgeCelebration.color}66`,
              }}
            >
              <span className="text-base mr-2">🏅</span>
              <span className="text-sm font-semibold">{badgeCelebration.name}</span>
            </div>
            {badgeCelebration.description ? (
              <p className="text-xs text-gray-300 mb-4 leading-relaxed px-1">
                {badgeCelebration.description}
              </p>
            ) : (
              <p className="text-xs text-gray-400 mb-4">
                Продовжуй у тому ж дусі, щоб відкрити ще більше нагород.
              </p>
            )}
            <button
              onClick={() => setBadgeCelebration(null)}
              className="px-5 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold tracking-wide text-black shadow-lg shadow-emerald-900/40 active:scale-95 transition-transform"
            >
              Круто!
            </button>
          </div>
        </div>
      )}
      {/* ---- Loot win modal ---- */}
      {lootWinModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-[84%] max-w-sm px-5 py-6 rounded-3xl bg-slate-900/95 border border-emerald-400/40 shadow-2xl shadow-emerald-900/60 text-center">
            <div className="mb-2 text-4xl">🎉</div>
            <h3 className="text-sm font-bold text-emerald-300 uppercase tracking-[0.2em] mb-2">
              Вітаємо з виграшем!
            </h3>

            <div
              className="inline-flex items-center justify-center px-4 py-2 rounded-2xl mb-3"
              style={{
                background: "linear-gradient(135deg, rgba(16,185,129,0.20), rgba(16,185,129,0.08))",
                border: "1px solid rgba(16,185,129,0.45)",
              }}
            >
              <div
                className="w-16 h-12 rounded-xl bg-slate-900/80 mr-2 overflow-hidden flex items-center justify-center border"
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
                  <span>🎁</span>
                )}
              </div>
              <span className="text-sm font-semibold text-gray-100">
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
              className="px-5 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold tracking-wide text-black shadow-lg shadow-emerald-900/40 active:scale-95 transition-transform"
            >
              Забрати
            </button>
          </div>
        </div>
      )}
      {requestUseModalReward && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-full max-w-sm rounded-3xl bg-slate-900/95 border border-sky-400/40 p-5 text-center shadow-2xl shadow-sky-900/30">
            <div className="text-3xl mb-2">📨</div>
            <h3 className="text-sm font-bold text-sky-300 uppercase tracking-[0.15em] mb-2">
              Запит на використання
            </h3>
            <p className="text-xs text-gray-300 mb-1">
              Надіслати адміну запит для бонуса:
            </p>
            <p className="text-sm font-semibold text-gray-100 mb-4">
              {(() => {
                const def = (lootState?.catalog || []).find(
                  (c) => c.reward_key === requestUseModalReward.reward_key,
                );
                return def?.title || requestUseModalReward.reward_key;
              })()}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRequestUseModalReward(null)}
                className="py-2 rounded-xl bg-slate-800 border border-slate-700 text-xs font-semibold"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => handleRequestUseReward(requestUseModalReward)}
                disabled={!!requestingRewardId}
                className="py-2 rounded-xl bg-sky-600 text-black text-xs font-bold disabled:opacity-50"
              >
                {requestingRewardId ? "Надсилання..." : "Надіслати"}
              </button>
            </div>
          </div>
        </div>
      )}
      {requestUseResultModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative z-50 w-full max-w-sm rounded-3xl bg-slate-900/95 border border-slate-700 p-5 text-center shadow-2xl">
            <h3 className="text-sm font-bold text-gray-100 mb-2">{requestUseResultModal.title}</h3>
            <p className="text-xs text-gray-400 mb-4">{requestUseResultModal.message}</p>
            <button
              type="button"
              onClick={() => setRequestUseResultModal(null)}
              className="px-4 py-2 rounded-xl bg-emerald-600 text-black text-xs font-bold"
            >
              ОК
            </button>
          </div>
        </div>
      )}
      {/* ---- Hero card with avatar ---- */}
      <div className="relative mb-6 rounded-3xl overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-700" />
        <FloatingParticles />

        <div className="relative px-5 pt-6 pb-5">
          {/* Avatar + name */}
          <div className="flex items-center gap-4 mb-5">
            <div className="relative">
              <div
                className={`w-[72px] h-[72px] rounded-2xl backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg border border-white/20 bg-gradient-to-br ${avatar.bg}`}
                style={{ boxShadow: `0 20px 60px ${avatar.ring}22` }}
              >
                {avatar.emoji}
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-500 text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-md">
                LV{levelState.level}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-extrabold tracking-tight truncate">{p.nickname}</h1>
              <p className="text-emerald-100/80 text-sm">#{String(p.id).padStart(3, "0")} • {p.team || "Соло Гравець"}</p>
            </div>
          </div>

          {/* Rating */}
          <div className="flex items-center justify-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl py-4 px-5 border border-white/10">
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
              <div className="text-xs text-emerald-100/60 uppercase tracking-wider font-semibold">Рейтинг</div>
              <div className="text-[13px] text-emerald-100/80">
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
        <QuickStat value={`${winRate}%`} label="Перемог" />
        <QuickStat value={p.mvp_count} label="MVP" accent />
      </div>

      {/* ---- Combat stats card ---- */}
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-slate-700/50">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-base">⚔️</span>
          <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Статистика боїв</h3>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <CombatStat icon="💀" value={p.total_deaths} label="Смертей" color="text-red-400" />
          <CombatStat icon="🛡" value={`${survivalRate}%`} label="Виживань" color="text-emerald-400" />
        </div>

        {/* Survival Rate bar */}
        <div className="mt-1 mb-1">
          <div className="flex justify-between text-[10px] text-gray-500 mb-1.5">
            <span className="font-semibold">Виживання, %</span>
            <span className={`font-bold ${
              survivalRate >= 70 ? "text-emerald-400" : survivalRate >= 40 ? "text-amber-400" : "text-red-400"
            }`}>{survivalRate}%</span>
          </div>
          <div className="relative h-2 bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className={`absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ${
                survivalRate >= 70
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                  : survivalRate >= 40
                    ? "bg-gradient-to-r from-amber-500 to-amber-400"
                    : "bg-gradient-to-r from-red-500 to-red-400"
              }`}
              style={{ width: `${survivalRate}%` }}
            />
          </div>
        </div>
      </div>

      {/* ---- Badges ---- */}
      {profile.badges?.length > 0 && (
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🎖</span>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                Нагороди
              </h3>
            </div>
            <span className="text-xs text-gray-500 bg-slate-700 px-2 py-0.5 rounded-full">
              {profile.badges.length}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {profile.badges.map((b, i) => {
              const IconComponent = BADGE_ICONS[b.badge_icon] || Award;
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
                  className="group relative px-3 py-2 rounded-xl border transition-all duration-300 hover:scale-105 active:scale-95 text-left cursor-pointer"
                  style={{
                    borderColor: `${b.badge_color}40`,
                    background: `linear-gradient(135deg, ${b.badge_color}15, ${b.badge_color}08)`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${b.badge_color}25` }}
                    >
                      {badgeEmoji ? (
                        <span className="text-sm leading-none">{badgeEmoji}</span>
                      ) : (
                        <IconComponent
                          size={16}
                          color={b.badge_color}
                          strokeWidth={2.5}
                        />
                      )}
                    </div>
                    <span className="text-xs font-semibold">
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
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🎰</span>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                Колесо фортуни
              </h3>
            </div>
            <span className="text-xs text-gray-400">
              Доступні оберти:{" "}
              <span className="font-semibold text-emerald-300">
                {lootState.remainingSpins}
              </span>
            </span>
          </div>

          {/* Смуга кейсів у стилі CS:GO */}
          <div className="relative h-20 bg-slate-900/80 rounded-2xl overflow-hidden border border-slate-700/60 mb-3">
            <div className="absolute inset-y-0 left-1/2 w-[2px] bg-emerald-400/80 shadow-[0_0_10px_rgba(16,185,129,0.8)] z-20" />
            {/* Контур активного айтема по центру */}
            <div className="pointer-events-none absolute inset-y-1 left-1/2 -translate-x-1/2 w-[88px] rounded-xl border-2 border-emerald-400/80 shadow-[0_0_16px_rgba(16,185,129,0.8)] z-10" />
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
                        className="w-20 h-16 rounded-xl flex flex-col items-center justify-center text-[10px] font-semibold text-gray-100 shadow-md bg-slate-800/80 border"
                        style={{ borderColor: rarityColor }}
                      >
                        <div className="w-12 h-8 rounded-lg bg-slate-900/80 mb-1 overflow-hidden flex items-center justify-center">
                          {imgUrl ? (
                            <img
                              src={imgUrl}
                            alt={displayTitle}
                              className="w-full h-full object-contain"
                            />
                          ) : (
                            <span>🎁</span>
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
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-3 rounded-2xl font-bold text-[14px] shadow-lg shadow-emerald-900/30 active:scale-[0.98] disabled:opacity-50"
          >
            {spinning || lootLoading ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Крутиться...
              </span>
            ) : lootState.remainingSpins > 0 ? (
              "🎰 Крутити"
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
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span>🎁</span>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
                Бонуси
              </h3>
            </div>
            <span className="text-xs text-gray-500 bg-slate-700 px-2 py-0.5 rounded-full">
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
                  className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-slate-900/70 border border-slate-700/60"
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold overflow-hidden"
                      style={{
                        border: `1px solid ${rarityColor}`,
                        background: "rgba(15,23,42,0.8)",
                      }}
                    >
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={title}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span>🎁</span>
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
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                        isActive
                          ? "bg-emerald-600/20 text-emerald-300"
                          : "bg-slate-700/60 text-gray-400"
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
                        onClick={() => setRequestUseModalReward(rw)}
                        disabled={!!requestingRewardId || isRequested}
                        className={`text-[10px] font-semibold px-2 py-1 rounded-lg border active:scale-95 disabled:opacity-50 ${
                          isRequested
                            ? "bg-sky-500/15 text-sky-300 border-sky-400/30"
                            : "bg-amber-500/20 text-amber-300 border-amber-400/30"
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
      <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 mb-4 border border-slate-700/50">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">🤝</span>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">
              Друзі
            </h3>
          </div>
          <span className="text-xs text-gray-500 bg-slate-700 px-2 py-0.5 rounded-full">
            {friendsInfo.friends.length}
          </span>
        </div>

        {/* Add friend using PlayerSearch */}
        <div className="mb-3">
          <PlayerSearch
            placeholder="Запросити друга"
            icon="🤝"
            onSelect={async (player) => {
              try {
                setFriendsError("");
                await sendFriendRequest(player.nickname);
                haptic("success");
                showAlert(`✅ Запит у друзі надіслано для ${player.nickname}`);
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
                className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-slate-900/60"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">🪖</span>
                  <span className="text-xs font-medium">{f.nickname}</span>
                </div>
                <span className="text-[10px] text-gray-500">
                  ⭐{f.rating}
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
              <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
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
                  className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-slate-900/60"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">📩</span>
                    <span className="text-xs font-medium">
                      {r.from_nickname || r.nickname}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() =>
                        handleRespondFriend(r.request_id || r.id, "accept")
                      }
                      className="px-2 py-1 rounded-lg bg-emerald-600 text-[10px] font-bold text-black active:scale-95"
                    >
                      Прийняти
                    </button>
                    <button
                      onClick={() =>
                        handleRespondFriend(r.request_id || r.id, "reject")
                      }
                      className="px-2 py-1 rounded-lg bg-slate-700 text-[10px] font-bold text-gray-200 active:scale-95"
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
        <div className="bg-slate-800/80 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🎮</span>
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Історія ігор</h3>
            </div>
            <span className="text-xs text-gray-500">{profile.recentGames.length} ігор</span>
          </div>

          <div className="space-y-2">
            {profile.recentGames.map((g) => {
              const isFinished = g.status === "finished";
              const isWin = isFinished && g.result === "win";
              const isLoss = isFinished && g.result === "loss";

              const badgeBg = isFinished
                ? isWin
                  ? "bg-emerald-600/20 text-emerald-400"
                  : isLoss
                  ? "bg-red-600/20 text-red-400"
                  : "bg-slate-600/40 text-gray-300"
                : "bg-slate-600/40 text-gray-300";

              const cardBg = isFinished
                ? isWin
                  ? "bg-emerald-950/30 border-emerald-800/30"
                  : isLoss
                  ? "bg-red-950/20 border-red-900/20"
                  : "bg-slate-900/40 border-slate-800/40"
                : "bg-slate-900/40 border-slate-800/40";

              let labelText = "В ПРОЦЕСІ";
              if (isFinished) {
                labelText = isWin ? "ПЕРЕМОГА" : isLoss ? "ПОРАЗКА" : "ЗАВЕРШЕНО";
              } else if (g.status === "checkin") {
                labelText = "CHECK-IN";
              } else if (g.status === "upcoming") {
                labelText = "ЗАПЛАНОВАНА";
              }

              return (
                <div
                  key={g.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${cardBg}`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-black ${badgeBg}`}
                  >
                    {isFinished ? (isWin ? "W" : isLoss ? "L" : "—") : "•"}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">Гра #{g.id}</span>
                      <span className="text-[10px] text-gray-500 bg-slate-700 px-1.5 py-0.5 rounded">
                        {g.game_mode === "team_vs_team"
                          ? "TvT"
                          : g.game_mode === "random_teams"
                          ? "Random"
                          : "FFA"}
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{g.date}</span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs font-bold text-gray-300">
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
        <div className="bg-slate-800/50 rounded-2xl p-8 text-center border border-slate-700/30 border-dashed">
          <div className="text-4xl mb-3">🎯</div>
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
    <div className="bg-slate-800/80 backdrop-blur-sm rounded-xl p-2.5 text-center border border-slate-700/50">
      <div className={`text-lg font-black ${accent ? "text-emerald-400" : "text-white"}`}>
        {value}
      </div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">{label}</div>
    </div>
  );
}

function CombatStat({ icon, value, label, color }) {
  return (
    <div className="text-center">
      <div className="text-lg mb-0.5">{icon}</div>
      <div className={`text-xl font-black ${color}`}>{value}</div>
      <div className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</div>
    </div>
  );
}
