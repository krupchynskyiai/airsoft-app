import React, { useState, useEffect, useRef } from "react";
import { useTelegram } from "./hooks/useTelegram";
import { getProfile, setCallsign } from "./api";
import Profile from "./pages/Profile";
import Games from "./pages/Games";
import GameDetail from "./pages/GameDetail";
import Leaderboard from "./pages/Leaderboard";
import Teams from "./pages/Teams";
import Admin from "./pages/Admin";
import Contacts from "./pages/Contacts";

const TABS = [
  { id: "profile", icon: "👤", activeIcon: "👤", label: "Профіль" },
  { id: "games", icon: "🎮", activeIcon: "🎮", label: "Ігри" },
  { id: "teams", icon: "🏠", activeIcon: "🏠", label: "Команди" },
  { id: "contacts", icon: "📣", activeIcon: "📣", label: "Контакти" },
  { id: "leaderboard", icon: "🏆", activeIcon: "🏆", label: "Рейтинг" },
  { id: "admin", icon: "⚙️", activeIcon: "⚙️", label: "Адмін" },
];

export default function App() {
  const { user, haptic } = useTelegram();

  const [tab, setTab] = useState("profile");
  const [prevTab, setPrevTab] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedGameId, setSelectedGameId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [slideDir, setSlideDir] = useState("right");
  const [showCallsignModal, setShowCallsignModal] = useState(false);
  const [callsignDraft, setCallsignDraft] = useState("");
  const [callsignStep, setCallsignStep] = useState("input"); // input | confirm
  const [callsignSaving, setCallsignSaving] = useState(false);
  const [callsignError, setCallsignError] = useState("");

  const contentRef = useRef(null);

  // -------------------------------
  // TELEGRAM DEEP LINK
  // -------------------------------

  useEffect(() => {
    function getStartParam() {
      const tg = window.Telegram?.WebApp;
  
      if (tg?.initDataUnsafe?.start_param) {
        return tg.initDataUnsafe.start_param;
      }
  
      const params = new URLSearchParams(window.location.search);
      return params.get("startapp");
    }
  
    const startParam = getStartParam();
  
    if (startParam && startParam.startsWith("game_")) {
      const gid = parseInt(startParam.replace("game_", ""));
      if (!isNaN(gid)) {
        setSelectedGameId(gid);
        setTab("game_detail");
      }
    }
  }, []);

  useEffect(() => {
    loadProfile();
  }, []);

  useEffect(() => {
    const needsCallsign =
      profile?.registered &&
      profile?.player &&
      (!profile.player.callsign || String(profile.player.callsign).trim() === "");
    if (needsCallsign) {
      setShowCallsignModal(true);
      setCallsignStep("input");
      setCallsignError("");
    } else {
      setShowCallsignModal(false);
    }
  }, [profile]);

  async function loadProfile() {
    try {
      let data = null;
      let lastError = null;
      for (let i = 0; i < 3; i += 1) {
        try {
          data = await getProfile();
          break;
        } catch (e) {
          lastError = e;
          await new Promise((resolve) => setTimeout(resolve, 400 + i * 300));
        }
      }
      if (!data) throw lastError || new Error("Profile load failed");
      setProfile(data);
      setIsAdmin(data.is_admin === true);
    } catch (e) {
      console.error("Profile load error:", e);
      setProfile({ registered: false, profileLoadFailed: true });
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  }

  const visibleTabs = TABS.filter((t) => t.id !== "admin" || isAdmin);

  function switchTab(id) {
    if (id === tab) return;

    haptic("impact");

    const currentIdx = visibleTabs.findIndex((t) => t.id === tab);
    const nextIdx = visibleTabs.findIndex((t) => t.id === id);

    setSlideDir(nextIdx > currentIdx ? "right" : "left");

    setPrevTab(tab);
    setSelectedGameId(null);
    setTab(id);

    if (contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }

    setTimeout(() => setPrevTab(null), 300);
  }

  function openGame(id) {
    haptic("impact");

    setSelectedGameId(id);
    setSlideDir("right");
    setPrevTab(tab);
    setTab("game_detail");

    setTimeout(() => setPrevTab(null), 300);
  }

  async function submitCallsign() {
    const value = callsignDraft.trim();
    if (!value) {
      setCallsignError("Введи позивний");
      return;
    }
    if (value.length > 24) {
      setCallsignError("Максимум 24 символи");
      return;
    }
    if (!/^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]+$/u.test(value)) {
      setCallsignError("Дозволені тільки кириличні літери");
      return;
    }
    try {
      setCallsignSaving(true);
      setCallsignError("");
      await setCallsign(value);
      await loadProfile();
      setShowCallsignModal(false);
      setCallsignDraft("");
      setCallsignStep("input");
    } catch (e) {
      setCallsignError(e.message || "Не вдалося зберегти позивний");
    } finally {
      setCallsignSaving(false);
    }
  }

  // -------------------------------
  // LOADING SCREEN
  // -------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="relative mb-6 mx-auto w-fit">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-emerald-500 to-cyan-600 flex items-center justify-center text-4xl shadow-2xl shadow-emerald-900/50 animate-bounce-slow">
              🎯
            </div>
            <div className="absolute -inset-2 rounded-[26px] border-2 border-emerald-500/20 animate-ping-slow" />
          </div>

          <h2 className="text-lg font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent mb-2">
            Airsoft Club
          </h2>

          <div className="flex items-center justify-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-dot1" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-dot2" />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-dot3" />
          </div>
        </div>

        <style>{`
          @keyframes bounce-slow { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
          .animate-bounce-slow { animation: bounce-slow 2s ease-in-out infinite; }

          @keyframes ping-slow { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.3); opacity: 0; } }
          .animate-ping-slow { animation: ping-slow 2s ease-out infinite; }

          @keyframes dot1 { 0%,100% { opacity: 0.3; } 33% { opacity: 1; } }
          @keyframes dot2 { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
          @keyframes dot3 { 0%,100% { opacity: 0.3; } 66% { opacity: 1; } }

          .animate-dot1 { animation: dot1 1.2s ease infinite; }
          .animate-dot2 { animation: dot2 1.2s ease infinite; }
          .animate-dot3 { animation: dot3 1.2s ease infinite; }
        `}</style>
      </div>
    );
  }

  // -------------------------------
  // APP
  // -------------------------------

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="h-[env(safe-area-inset-top,0px)]" />

      <main
        ref={contentRef}
        className="flex-1 overflow-y-auto overflow-x-hidden pb-24"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        <div
          className={`px-4 pt-3 transition-all duration-300 ease-out ${
            prevTab !== null
              ? slideDir === "right"
                ? "animate-slide-in-right"
                : "animate-slide-in-left"
              : ""
          }`}
        >
          {tab === "profile" && (
            <Profile profile={profile} onReload={loadProfile} />
          )}

          {tab === "games" && (
            <Games onOpenGame={openGame} />
          )}

          {tab === "game_detail" && (
            <GameDetail
              gameId={selectedGameId}
              isAdmin={isAdmin}
              onBack={() => {
                setSlideDir("left");
                setPrevTab(tab);
                setTab("games");
                setSelectedGameId(null);
                setTimeout(() => setPrevTab(null), 300);
              }}
            />
          )}

          {tab === "teams" && (
            <Teams onReloadProfile={loadProfile} />
          )}

          {tab === "leaderboard" && (
            <Leaderboard />
          )}

          {tab === "contacts" && (
            <Contacts />
          )}

          {tab === "admin" && (
            <Admin />
          )}
        </div>
      </main>

      {/* NAVIGATION */}
      <nav className="fixed bottom-0 left-0 right-0 z-50">
        <div className="h-6 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />

        <div className="bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/50 px-2 pb-4">
          <div className="flex items-stretch">
            {visibleTabs.map((t) => {
              const isActive = tab === t.id;

              return (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  className="flex-1 relative flex flex-col items-center pt-2 pb-1.5 transition-all duration-200 active:scale-90"
                >
                  <div
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-300 ${
                      isActive ? "w-6 bg-emerald-400" : "w-0"
                    }`}
                  />

                  <div
                    className={`relative w-10 h-8 flex items-center justify-center rounded-xl transition-all duration-200 ${
                      isActive ? "bg-emerald-500/15 scale-110" : ""
                    }`}
                  >
                    <span
                      className={`text-xl transition-all duration-200 ${
                        isActive ? "scale-110" : "grayscale opacity-60"
                      }`}
                    >
                      {isActive ? t.activeIcon : t.icon}
                    </span>

                    {isActive && (
                      <div className="absolute inset-0 rounded-xl bg-emerald-400/10 blur-md" />
                    )}
                  </div>

                  <span
                    className={`text-[10px] font-semibold mt-0.5 ${
                      isActive ? "text-emerald-400" : "text-gray-500"
                    }`}
                  >
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-30px); }
          to { opacity: 1; transform: translateX(0); }
        }

        .animate-slide-in-right { animation: slideInRight 0.3s ease-out; }
        .animate-slide-in-left { animation: slideInLeft 0.3s ease-out; }

        main::-webkit-scrollbar { display: none; }
        main { -ms-overflow-style: none; scrollbar-width: none; }

        * { -webkit-tap-highlight-color: transparent; }
      `}</style>

      {showCallsignModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-sm rounded-3xl border border-emerald-500/40 bg-slate-900/95 p-5">
            <div className="text-center mb-3">
              <div className="text-3xl mb-1">📛</div>
              <h3 className="text-sm font-black text-emerald-300 uppercase tracking-[0.15em]">
                Позивний
              </h3>
            </div>

            {callsignStep === "input" ? (
              <>
                <p className="text-xs text-gray-400 mb-2">
                  Вкажи свій позивний (до 24 символів). Змінити потім можна лише через адміна.
                </p>
                <p className="text-[11px] text-amber-300/90 mb-2">
                  Рекомендація: обирай короткий позивний, який легко гукнути під час гри.
                </p>
                <input
                  type="text"
                  value={callsignDraft}
                  maxLength={24}
                  onChange={(e) => {
                    setCallsignDraft(e.target.value);
                    if (callsignError) setCallsignError("");
                  }}
                  placeholder="Наприклад: GhostFox"
                  className="w-full bg-slate-800/70 border border-slate-700/60 rounded-2xl px-3 py-2 text-sm focus:outline-none focus:border-emerald-500/50"
                />
                <div className="mt-1 text-[10px] text-gray-500 text-right">
                  {callsignDraft.trim().length}/24
                </div>
                {callsignError && (
                  <div className="mt-2 text-[11px] text-red-400">{callsignError}</div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    const v = callsignDraft.trim();
                    if (!v) return setCallsignError("Введи позивний");
                    if (v.length > 24) return setCallsignError("Максимум 24 символи");
                    if (!/^[А-ЩЬЮЯЄІЇҐа-щьюяєіїґ]+$/u.test(v)) {
                      return setCallsignError("Дозволені тільки кириличні літери");
                    }
                    setCallsignStep("confirm");
                  }}
                  className="mt-3 w-full py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-bold active:scale-[0.98]"
                >
                  Продовжити
                </button>
              </>
            ) : (
              <>
                <p className="text-xs text-gray-400 mb-2">
                  Перевір, чи немає помилки. Після підтвердження зміну робить тільки адмін.
                </p>
                <div className="mb-3 rounded-2xl border border-emerald-500/30 bg-emerald-900/20 px-3 py-2 text-center">
                  <span className="text-base font-black text-emerald-200">
                    {callsignDraft.trim()}
                  </span>
                </div>
                {callsignError && (
                  <div className="mb-2 text-[11px] text-red-400">{callsignError}</div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCallsignStep("input")}
                    disabled={callsignSaving}
                    className="py-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-xs font-semibold disabled:opacity-50"
                  >
                    Назад
                  </button>
                  <button
                    type="button"
                    onClick={submitCallsign}
                    disabled={callsignSaving}
                    className="py-2.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-black text-xs font-black disabled:opacity-50"
                  >
                    {callsignSaving ? "Збереження..." : "Підтвердити"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}