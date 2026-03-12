import React, { useState, useEffect, useRef } from "react";
import { useTelegram } from "./hooks/useTelegram";
import { getProfile } from "./api";
import Profile from "./pages/Profile";
import Games from "./pages/Games";
import GameDetail from "./pages/GameDetail";
import Leaderboard from "./pages/Leaderboard";
import Teams from "./pages/Teams";
import Admin from "./pages/Admin";

const TABS = [
  { id: "profile", icon: "👤", activeIcon: "👤", label: "Профіль" },
  { id: "games", icon: "🎮", activeIcon: "🎮", label: "Ігри" },
  { id: "teams", icon: "🏠", activeIcon: "🏠", label: "Команди" },
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
  const contentRef = useRef(null);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      const data = await getProfile();
      setProfile(data);
      setIsAdmin(data.is_admin === true);
    } catch (e) {
      console.error("Profile load error:", e);
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

  // ---- Loading screen ----
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-900">
        <div className="text-center">
          <div className="relative mb-6">
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

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col">
      {/* ---- Status bar spacer (for Telegram safe area) ---- */}
      <div className="h-[env(safe-area-inset-top,0px)]" />

      {/* ---- Scrollable content ---- */}
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
          {tab === "games" && <Games onOpenGame={openGame} />}
          {tab === "game_detail" && (
            <GameDetail
              gameId={selectedGameId}
              onBack={() => {
                setSlideDir("left");
                setPrevTab(tab);
                setTab("games");
                setSelectedGameId(null);
                setTimeout(() => setPrevTab(null), 300);
              }}
              isAdmin={isAdmin}
            />
          )}
          {tab === "teams" && <Teams onReloadProfile={loadProfile} />}
          {tab === "leaderboard" && <Leaderboard />}
          {tab === "admin" && <Admin />}
        </div>
      </main>

      {/* ---- Bottom Navigation ---- */}
      <nav className="fixed bottom-0 left-0 right-0 z-50">
        {/* Gradient fade above nav */}
        <div className="h-6 bg-gradient-to-t from-slate-900 to-transparent pointer-events-none" />

        <div className="bg-slate-900/95 backdrop-blur-xl border-t border-slate-700/50 px-2 pb-[env(safe-area-inset-bottom,8px)]">
          <div className="flex items-stretch">
            {visibleTabs.map((t) => {
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => switchTab(t.id)}
                  className="flex-1 relative flex flex-col items-center pt-2 pb-1.5 transition-all duration-200 active:scale-90"
                >
                  {/* Active indicator line */}
                  <div
                    className={`absolute top-0 left-1/2 -translate-x-1/2 h-[3px] rounded-full transition-all duration-300 ${
                      isActive ? "w-6 bg-emerald-400" : "w-0 bg-transparent"
                    }`}
                  />

                  {/* Icon container */}
                  <div
                    className={`relative w-10 h-8 flex items-center justify-center rounded-xl transition-all duration-200 ${
                      isActive ? "bg-emerald-500/15 scale-110" : ""
                    }`}
                  >
                    <span
                      className={`text-xl transition-all duration-200 ${
                        isActive ? "scale-110" : "scale-100 grayscale opacity-60"
                      }`}
                    >
                      {isActive ? t.activeIcon : t.icon}
                    </span>

                    {/* Glow effect */}
                    {isActive && (
                      <div className="absolute inset-0 rounded-xl bg-emerald-400/10 blur-md" />
                    )}
                  </div>

                  {/* Label */}
                  <span
                    className={`text-[10px] font-semibold mt-0.5 transition-all duration-200 ${
                      isActive
                        ? "text-emerald-400"
                        : "text-gray-500"
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

      {/* ---- Global animations ---- */}
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

        /* Hide scrollbar but keep scrolling */
        main::-webkit-scrollbar { display: none; }
        main { -ms-overflow-style: none; scrollbar-width: none; }

        /* Smooth touch scrolling */
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  );
}