import React, { useState, useEffect, useCallback } from "react";
import {
  getAllTeams, getTeamDetail, applyToTeam, cancelApplication,
  resolveApplication, inviteToTeam, getMyInvites, respondToInvite, leaveTeam,
  createTeam,
} from "../api";
import { useTelegram } from "../hooks/useTelegram";
import PlayerSearch from "../components/PlayerSearch";

export default function Teams({ onReloadProfile }) {
  const [teams, setTeams] = useState([]);
  const [invites, setInvites] = useState([]);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [showLeaveWarningCreate, setShowLeaveWarningCreate] = useState(false);
  const [currentTeamId, setCurrentTeamId] = useState(null);
  const { haptic, showAlert } = useTelegram();

  useEffect(() => { loadTeams(); }, []);

  async function loadTeams() {
    setLoading(true);
    try {
      const [t, inv, profile] = await Promise.all([
        getAllTeams(),
        getMyInvites(),
        import("../api").then(m => m.getProfile()),
      ]);
      setTeams(t);
      setInvites(inv);
      setCurrentTeamId(profile.player?.team_id || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim() || newTeamName.trim().length < 2) return;
    setCreateLoading(true);
    try {
      await createTeam(newTeamName.trim());
      haptic("success");
      showAlert("✅ Команду створено! Ти — капітан.");
      setShowCreate(false);
      setNewTeamName("");
      setShowLeaveWarningCreate(false);
      loadTeams();
      if (onReloadProfile) onReloadProfile();
    } catch (e) {
      showAlert(e.message);
      haptic("error");
    } finally {
      setCreateLoading(false);
    }
  }

  if (selectedTeam) {
    return (
      <TeamDetail
        teamId={selectedTeam}
        onBack={() => { setSelectedTeam(null); loadTeams(); }}
        onReloadProfile={onReloadProfile}
      />
    );
  }

  return (
    <div className="pb-4">
      <div className="mb-5">
        <h2 className="text-2xl font-black">Команди</h2>
        <p className="text-sm text-gray-500">Знайди свою команду або створи заявку</p>
      </div>

      {/* Invites */}
      {invites.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span>📩</span>
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Запрошення</h3>
            <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">{invites.length}</span>
          </div>
          <div className="space-y-2">
            {invites.map((inv) => (
              <InviteCard
                key={inv.id}
                invite={inv}
                onAccept={async () => {
                  try {
                    await respondToInvite(inv.id, "accept");
                    haptic("success");
                    showAlert("✅ Ти приєднався до команди!");
                    loadTeams();
                    if (onReloadProfile) onReloadProfile();
                  } catch (e) { showAlert(e.message); haptic("error"); }
                }}
                onReject={async () => {
                  try {
                    await respondToInvite(inv.id, "reject");
                    haptic("impact");
                    loadTeams();
                  } catch (e) { showAlert(e.message); }
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Create team */}
      <div className="mb-5">
        {showLeaveWarningCreate ? (
          <div className="bg-red-950/20 border border-red-800/30 rounded-2xl p-4">
            <div className="text-center mb-3">
              <div className="text-3xl mb-2">⚠️</div>
              <h4 className="font-bold text-red-300">Ти вже в команді</h4>
              <p className="text-sm text-gray-400 mt-1">
                При створенні нової команди ти автоматично покинеш поточну. Продовжити?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowLeaveWarningCreate(false); setShowCreate(true); }}
                className="flex-1 bg-red-700 py-3 rounded-xl font-bold text-sm active:scale-95"
              >
                Так, створити нову
              </button>
              <button
                onClick={() => setShowLeaveWarningCreate(false)}
                className="flex-1 bg-slate-700 py-3 rounded-xl font-bold text-sm text-gray-400 active:scale-95"
              >
                Скасувати
              </button>
            </div>
          </div>
        ) : showCreate ? (
          <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4">
            <h3 className="font-bold text-sm mb-3">Створити команду</h3>
            <div className="relative mb-3">
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Назва команди"
                maxLength={30}
                className="w-full bg-slate-700/40 border border-slate-600/30 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
                autoFocus
              />
              {newTeamName.length > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-500">{newTeamName.length}/30</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateTeam}
                disabled={createLoading || newTeamName.trim().length < 2}
                className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-600 py-3 rounded-xl font-bold text-sm active:scale-95 disabled:opacity-50"
              >
                {createLoading ? (
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                ) : (
                  "✅ Створити"
                )}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewTeamName(""); }}
                className="px-4 bg-slate-700 rounded-xl text-sm text-gray-400"
              >
                ✕
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => {
              haptic("impact");
              if (currentTeamId) {
                setShowLeaveWarningCreate(true);
              } else {
                setShowCreate(true);
              }
            }}
            className="w-full bg-slate-800/60 border-2 border-dashed border-slate-600/50 hover:border-emerald-500/40 py-4 rounded-2xl font-bold text-sm text-gray-400 hover:text-emerald-400 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span className="text-lg">+</span> Створити свою команду
          </button>
        )}
      </div>

      {/* Teams list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-800/50 rounded-2xl p-5 animate-pulse">
              <div className="h-5 bg-slate-700 rounded w-1/3 mb-2" />
              <div className="h-3 bg-slate-700 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🏠</div>
          <p className="text-gray-400 font-medium">Команд поки немає</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => { haptic("impact"); setSelectedTeam(t.id); }}
              className="w-full text-left bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4 hover:border-slate-500/50 transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-xl">
                  🏠
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{t.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-2">
                    <span>👥 {t.member_count} гравців</span>
                    {t.captain_name && (
                      <>
                        <span className="text-gray-700">•</span>
                        <span>👑 {t.captain_name}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-black text-emerald-400">{t.rating}</div>
                  <div className="text-[10px] text-gray-600">pts</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Team Detail ----
function TeamDetail({ teamId, onBack, onReloadProfile }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [inviteNick, setInviteNick] = useState("");
  const [applyMessage, setApplyMessage] = useState("");
  const [showApplyForm, setShowApplyForm] = useState(false);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showLeaveWarning, setShowLeaveWarning] = useState(false);
  const { haptic, showAlert } = useTelegram();

  const load = useCallback(async () => {
    try {
      const d = await getTeamDetail(teamId);
      setData(d);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  async function doAction(fn, msg) {
    setActionLoading(true);
    try {
      await fn();
      haptic("success");
      if (msg) showAlert(msg);
      await load();
      if (onReloadProfile) onReloadProfile();
    } catch (e) { showAlert(e.message); haptic("error"); }
    finally { setActionLoading(false); }
  }

  if (loading) {
    return <div className="animate-pulse"><div className="h-48 bg-slate-800 rounded-2xl" /></div>;
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Команду не знайдено</p>
        <button onClick={onBack} className="text-emerald-400 text-sm mt-4">← Назад</button>
      </div>
    );
  }

  const { team, members, myApplication, isCaptain, pendingApps, myPlayerId, myTeamId } = data;
  const isMyTeam = members.some(m => m.id === myPlayerId);
  const hasTeam = !!myTeamId && myTeamId !== team.id;

  return (
    <div className="pb-6">
      <button onClick={onBack} className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-4 active:opacity-60">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
        Назад
      </button>

      {/* Team header */}
      <div className="relative rounded-2xl overflow-hidden mb-5">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-700/30 via-slate-800/20 to-slate-900" />
        <div className="relative p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-3xl">🏠</div>
            <div>
              <h2 className="text-xl font-black">{team.name}</h2>
              {team.captain_name && (
                <p className="text-sm text-gray-400">👑 Капітан: {team.captain_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span>👥</span><span className="font-bold">{members.length}</span><span className="text-gray-400 text-sm">гравців</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span>⭐</span><span className="font-bold text-emerald-400">{team.rating}</span><span className="text-gray-400 text-sm">pts</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="space-y-2 mb-5">
        {/* Apply button — available even if in another team */}
        {!myApplication && !isCaptain && !isMyTeam && (
          <>
            {showLeaveWarning ? (
              <div className="bg-red-950/20 border border-red-800/30 rounded-2xl p-4">
                <div className="text-center mb-3">
                  <div className="text-3xl mb-2">⚠️</div>
                  <h4 className="font-bold text-red-300">Ти вже в команді</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    При подачі заявки ти автоматично покинеш свою поточну команду. Продовжити?
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowLeaveWarning(false); setShowApplyForm(true); }}
                    className="flex-1 bg-red-700 py-3 rounded-xl font-bold text-sm active:scale-95"
                  >
                    Так, покинути і подати
                  </button>
                  <button
                    onClick={() => setShowLeaveWarning(false)}
                    className="flex-1 bg-slate-700 py-3 rounded-xl font-bold text-sm text-gray-400 active:scale-95"
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            ) : showApplyForm ? (
              <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4">
                <p className="text-sm font-medium mb-2">Повідомлення для капітана (не обовʼязково):</p>
                <textarea
                  value={applyMessage}
                  onChange={(e) => setApplyMessage(e.target.value)}
                  placeholder="Привіт! Хочу приєднатись..."
                  className="w-full bg-slate-700/40 border border-slate-600/30 rounded-xl px-3 py-2 text-sm mb-3 resize-none h-20 focus:border-emerald-500 focus:outline-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => doAction(() => applyToTeam(teamId, applyMessage), "✅ Заявку подано!")}
                    disabled={actionLoading}
                    className="flex-1 bg-emerald-600 py-3 rounded-xl font-bold text-sm active:scale-95 disabled:opacity-50"
                  >
                    {actionLoading ? "..." : "📝 Подати заявку"}
                  </button>
                  <button onClick={() => setShowApplyForm(false)} className="px-4 bg-slate-700 rounded-xl text-sm">✕</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  haptic("impact");
                  if (hasTeam) {
                    setShowLeaveWarning(true);
                  } else {
                    setShowApplyForm(true);
                  }
                }}
                className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-4 rounded-2xl font-bold text-[15px] active:scale-[0.98]"
              >
                📝 Подати заявку в команду
              </button>
            )}
          </>
        )}

        {/* Pending application */}
        {myApplication && (
          <div className="bg-amber-950/20 border border-amber-800/30 rounded-2xl p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-amber-400">⏳ Заявка на розгляді</p>
              <p className="text-xs text-gray-500">Очікуй рішення капітана</p>
            </div>
            <button
              onClick={() => doAction(() => cancelApplication(teamId), "Заявку скасовано")}
              className="text-xs bg-slate-700 px-3 py-1.5 rounded-lg text-gray-400 active:scale-95"
            >
              Скасувати
            </button>
          </div>
        )}

        {/* Leave team */}
        {isMyTeam && (
          <button
            onClick={() => doAction(() => leaveTeam(), "Ти покинув команду")}
            disabled={actionLoading}
            className="w-full bg-red-900/30 border border-red-800/30 py-3 rounded-2xl font-bold text-sm text-red-400 active:scale-[0.98]"
          >
            🚪 Покинути команду
          </button>
        )}
      </div>

      {/* Captain: Pending applications */}
      {isCaptain && pendingApps.length > 0 && (
        <div className="bg-amber-950/15 border border-amber-800/30 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <span>📋</span>
            <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider">Заявки</h3>
            <span className="bg-amber-500/20 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-full">{pendingApps.length}</span>
          </div>
          <div className="space-y-2">
            {pendingApps.map((app) => (
              <div key={app.id} className="bg-slate-800/40 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-bold text-sm">{app.nickname}</span>
                    <span className="text-xs text-gray-500 ml-2">⭐{app.rating} • {app.games_played}G</span>
                  </div>
                </div>
                {app.message && <p className="text-xs text-gray-400 mb-2 italic">"{app.message}"</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => doAction(() => resolveApplication(teamId, app.id, "accept"), "✅ Прийнято!")}
                    className="flex-1 bg-emerald-600/40 border border-emerald-600/30 py-2 rounded-lg text-sm font-bold text-emerald-300 active:scale-95"
                  >
                    ✅ Прийняти
                  </button>
                  <button
                    onClick={() => doAction(() => resolveApplication(teamId, app.id, "reject"))}
                    className="flex-1 bg-red-700/30 border border-red-700/30 py-2 rounded-lg text-sm font-bold text-red-400 active:scale-95"
                  >
                    ❌ Відхилити
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Captain: Invite player */}
      {isCaptain && (
        <div className="mb-5">
          {showInviteForm ? (
            <div className="bg-slate-800/60 border border-slate-700/40 rounded-2xl p-4">
              <PlayerSearch
                value={inviteNick}
                onChange={(v) => setInviteNick(v)}
                onSelect={(p) => setInviteNick(p.nickname)}
                placeholder="Знайди гравця"
                icon="🔍"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => doAction(() => inviteToTeam(teamId, inviteNick), "✅ Запрошення надіслано!")}
                  disabled={actionLoading || !inviteNick.trim()}
                  className="flex-1 bg-blue-600 py-3 rounded-xl font-bold text-sm active:scale-95 disabled:opacity-50"
                >
                  📩 Запросити
                </button>
                <button onClick={() => { setShowInviteForm(false); setInviteNick(""); }} className="px-4 bg-slate-700 rounded-xl text-sm text-gray-400">✕</button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { haptic("impact"); setShowInviteForm(true); }}
              className="w-full bg-blue-600/20 border border-blue-600/30 py-3 rounded-2xl font-bold text-sm text-blue-300 active:scale-[0.98]"
            >
              📩 Запросити гравця в команду
            </button>
          )}
        </div>
      )}

      {/* Members list */}
      <div className="bg-slate-800/60 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/40">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span>👥</span>
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Склад</h3>
          </div>
          <span className="text-xs text-gray-500 bg-slate-700/60 px-2 py-0.5 rounded-full">{members.length}</span>
        </div>
        {members.length === 0 ? (
          <p className="text-center text-gray-500 py-4 text-sm">Команда порожня</p>
        ) : (
          <div className="space-y-1">
            {members.map((m) => (
              <div key={m.id} className="flex items-center justify-between py-2.5 px-2 rounded-xl hover:bg-slate-700/20 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-700/60 flex items-center justify-center text-sm">
                    {team.captain_id === m.id ? "👑" : "🪖"}
                  </div>
                  <div>
                    <span className="text-sm font-medium">{m.nickname}</span>
                    {team.captain_id === m.id && <span className="text-[10px] text-amber-400 ml-1.5">Captain</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-400">{m.rating}</div>
                  <div className="text-[10px] text-gray-600">{m.wins}W / {m.games_played}G</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InviteCard({ invite, onAccept, onReject }) {
  return (
    <div className="bg-amber-950/15 border border-amber-800/30 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-amber-600/20 flex items-center justify-center text-lg">📩</div>
        <div>
          <p className="font-bold text-sm">{invite.team_name}</p>
          <p className="text-xs text-gray-500">Від: {invite.invited_by_name}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onAccept} className="flex-1 bg-emerald-600 py-2.5 rounded-xl text-sm font-bold active:scale-95">✅ Прийняти</button>
        <button onClick={onReject} className="flex-1 bg-slate-700 py-2.5 rounded-xl text-sm font-bold text-gray-400 active:scale-95">❌ Ні</button>
      </div>
    </div>
  );
}