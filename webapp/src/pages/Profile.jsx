import React, { useState, useEffect } from "react";
import {
  registerPlayer,
  getTeamsList,
  getFriends,
  sendFriendRequest,
  respondFriendRequest,
} from "../api";
import PlayerSearch from "../components/PlayerSearch";
import { useTelegram } from "../hooks/useTelegram";
import {
  Crosshair, Medal, Trophy, Crown, Flame, Star, Gem, Shield, Skull, Award
} from "lucide-react";

const BADGE_ICONS = {
  Crosshair, Medal, Trophy, Crown, Flame, Star, Gem, Shield, Skull, Award,
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
  const { haptic, showAlert } = useTelegram();
  const [retryProfileOnce, setRetryProfileOnce] = useState(false);
  const [badgeCelebration, setBadgeCelebration] = useState(null);
  const [friendsInfo, setFriendsInfo] = useState({ friends: [], incoming: [] });
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [friendsError, setFriendsError] = useState("");

  // If профіль ще не зареєстрований, спробувати один раз перезавантажити,
  // щоб дочекатися даних з Telegram / бекенду, перш ніж показувати форму.
  useEffect(() => {
    if (!profile?.registered && !retryProfileOnce) {
      setRetryProfileOnce(true);
      onReload();
    }
  }, [profile?.registered, retryProfileOnce, onReload]);

  if (!profile?.registered) {
    if (!retryProfileOnce) {
      // короткий локальний лоадер, поки триває перша спроба завантаження профілю
      return (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center text-sm text-gray-400">
            Завантаження профілю...
          </div>
        </div>
      );
    }
    return <RegisterForm onDone={onReload} />;
  }

  const p = profile.player;

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
  const survivalRate = p.games_played > 0
    ? Math.round(((p.games_played * 3 - p.total_deaths) / (p.games_played * 3)) * 100)
    : 100;

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
            <p className="text-xs text-gray-400 mb-4">
              Продовжуй у тому ж дусі, щоб відкрити ще більше нагород.
            </p>
            <button
              onClick={() => setBadgeCelebration(null)}
              className="px-5 py-2 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold tracking-wide text-black shadow-lg shadow-emerald-900/40 active:scale-95 transition-transform"
            >
              Круто!
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
              <div className="w-[72px] h-[72px] rounded-2xl bg-white/15 backdrop-blur-sm flex items-center justify-center text-3xl shadow-lg border border-white/20">
                🪖
              </div>
              <div className="absolute -bottom-1 -right-1 bg-amber-500 text-[10px] font-black px-1.5 py-0.5 rounded-md shadow-md">
                LV{Math.floor(p.rating / 100) + 1}
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
              <ProgressRing value={p.rating % 1000} max={1000} size={64} stroke={4} color="#fbbf24" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-lg font-black">{p.rating}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-emerald-100/60 uppercase tracking-wider font-semibold">Рейтинг</div>
              <div className="text-[13px] text-emerald-100/80">
                Далі: {1000 - (p.rating % 1000)} до рівня {Math.floor(p.rating / 100) + 2}
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
              return (
                <div
                  key={i}
                  className="group relative px-3 py-2 rounded-xl border transition-all duration-300 hover:scale-105"
                  style={{
                    borderColor: `${b.badge_color}40`,
                    background: `linear-gradient(135deg, ${b.badge_color}15, ${b.badge_color}08)`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${b.badge_color}25` }}
                    >
                      <IconComponent
                        size={16}
                        color={b.badge_color}
                        strokeWidth={2.5}
                      />
                    </div>
                    <span className="text-xs font-semibold">
                      {b.badge_name}
                    </span>
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

// ============================================
// REGISTRATION FORM
// ============================================

function RegisterForm({ onDone }) {
  const [nick, setNick] = useState("");
  const [teamId, setTeamId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [step, setStep] = useState("nick");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const { haptic } = useTelegram();

  async function loadTeams() {
    try {
      const t = await getTeamsList();
      setTeams(t);
    } catch (e) {}
  }

  async function submit() {
    setLoading(true);
    setErr("");
    try {
      await registerPlayer(nick, teamId);
      haptic("success");
      onDone();
    } catch (e) {
      setErr(e.message);
      haptic("error");
    } finally {
      setLoading(false);
    }
  }

  if (step === "nick") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-6">
        <div className="relative mb-8">
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-5xl shadow-2xl shadow-emerald-900/50">
            🎯
          </div>
          <div className="absolute -inset-3 rounded-[28px] border border-emerald-500/20 animate-pulse" />
        </div>

        <h1 className="text-3xl font-black mb-1 bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          Airsoft Club
        </h1>
        <p className="text-gray-400 text-sm mb-10">Введи свій бойовий позивний</p>

        <div className="w-full max-w-sm">
          <div className="relative mb-4">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">👤</div>
            <input
              value={nick}
              onChange={(e) => { setNick(e.target.value); setErr(""); }}
              placeholder="Nickname"
              maxLength={20}
              className="w-full bg-slate-800/80 border-2 border-slate-600/50 rounded-2xl pl-12 pr-4 py-4 text-lg font-medium focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-gray-600"
              autoFocus
            />
            {nick.length > 0 && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-gray-500">
                {nick.length}/20
              </div>
            )}
          </div>

          {err && (
            <div className="bg-red-900/30 border border-red-800/50 text-red-400 text-sm px-4 py-2.5 rounded-xl mb-4 flex items-center gap-2">
              <span>⚠️</span> {err}
            </div>
          )}

          <button
            onClick={() => {
              if (nick.trim().length >= 2) {
                haptic("impact");
                loadTeams();
                setStep("team");
              }
            }}
            disabled={nick.trim().length < 2}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-gray-500 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-emerald-900/30 transition-all duration-300 active:scale-[0.98]"
          >
            Далі →
          </button>
        </div>

        <p className="text-gray-600 text-xs mt-6">Мінімум 2 символи</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-[80vh] px-4">
      <button
        onClick={() => { setStep("nick"); haptic("impact"); }}
        className="text-emerald-400 text-sm mb-6 flex items-center gap-1 self-start"
      >
        ← Назад
      </button>

      <div className="text-center mb-8">
        <div className="text-4xl mb-3">🏠</div>
        <h2 className="text-2xl font-black mb-1">Обери команду</h2>
        <p className="text-gray-400 text-sm">Або грай як Соло Гравець</p>
      </div>

      <div className="space-y-2 mb-6 flex-1">
        <button
          onClick={() => { setTeamId(null); haptic("impact"); }}
          className={`w-full p-4 rounded-2xl border-2 flex items-center gap-3 transition-all duration-200 active:scale-[0.98] ${
            teamId === null
              ? "border-emerald-500 bg-emerald-950/40 shadow-lg shadow-emerald-900/20"
              : "border-slate-700/50 bg-slate-800/50"
          }`}
        >
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${
            teamId === null ? "bg-emerald-600/20" : "bg-slate-700"
          }`}>
            🐺
          </div>
          <div className="text-left flex-1">
            <div className="font-bold">Соло Гравець</div>
            <div className="text-xs text-gray-500">Без команди</div>
          </div>
          {teamId === null && <div className="text-emerald-400 text-lg">✓</div>}
        </button>

        {teams.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTeamId(t.id); haptic("impact"); }}
            className={`w-full p-4 rounded-2xl border-2 flex items-center gap-3 transition-all duration-200 active:scale-[0.98] ${
              teamId === t.id
                ? "border-emerald-500 bg-emerald-950/40 shadow-lg shadow-emerald-900/20"
                : "border-slate-700/50 bg-slate-800/50"
            }`}
          >
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${
              teamId === t.id ? "bg-emerald-600/20" : "bg-slate-700"
            }`}>
              🏠
            </div>
            <div className="text-left flex-1">
              <div className="font-bold">{t.name}</div>
            </div>
            {teamId === t.id && <div className="text-emerald-400 text-lg">✓</div>}
          </button>
        ))}
      </div>

      {err && (
        <div className="bg-red-900/30 border border-red-800/50 text-red-400 text-sm px-4 py-2.5 rounded-xl mb-4 flex items-center gap-2">
          <span>⚠️</span> {err}
        </div>
      )}

      <button
        onClick={() => { haptic("impact"); submit(); }}
        disabled={loading}
        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 py-4 rounded-2xl font-bold text-lg shadow-lg shadow-emerald-900/30 transition-all active:scale-[0.98] mb-4"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Реєстрація...
          </span>
        ) : (
          "Зареєструватись ✓"
        )}
      </button>
    </div>
  );
}