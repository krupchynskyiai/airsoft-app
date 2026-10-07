import React, { useState, useEffect, useCallback } from "react";
import {
  getAllTeams,
  getTeamDetail,
  applyToTeam,
  cancelApplication,
  resolveApplication,
  inviteToTeam,
  getMyInvites,
  respondToInvite,
  leaveTeam,
  createTeam,
  kickFromTeam,
  transferCaptain,
  disbandTeam,
} from "../api";
import { useTelegram } from "../hooks/useTelegram";
import PlayerSearch from "../components/PlayerSearch";
import {
  Crown, Shield, Users, Star, Mail, ClipboardList, PenLine, Hourglass, LogOut,
  Check, X, AlertTriangle, Search, Plus, ChevronLeft, Trash2, ChevronRight,
} from "lucide-react";

const BTN_PRIMARY = "bg-emerald-400 text-slate-950 font-bold rounded-lg active:scale-[0.98] transition-transform disabled:opacity-50";
const BTN_SECONDARY = "bg-slate-800 border border-slate-600/60 text-gray-200 rounded-lg active:scale-[0.98] transition-transform";
const BTN_DANGER = "bg-red-500/15 border border-red-400/40 text-red-300 rounded-lg active:scale-[0.98] transition-transform disabled:opacity-50";
const CARD = "bg-slate-900/80 border border-slate-700/50 rounded-2xl";
const CHIP = "rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider";
const INPUT = "w-full bg-slate-900/80 border border-slate-600/60 rounded-lg text-sm focus:border-emerald-400/60 focus:outline-none placeholder:text-gray-600";

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
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">Команди</h2>
        <p className="text-sm text-gray-500">Знайди свою команду або створи заявку</p>
      </div>

      {/* Invites */}
      {invites.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-3">
            <Mail className="w-5 h-5 text-amber-300" strokeWidth={2} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Запрошення</h3>
            <span className={`${CHIP} text-amber-300 border-amber-400/30 bg-amber-400/10`}>{invites.length}</span>
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
          <div className="bg-slate-900/80 border border-red-400/40 rounded-2xl p-4">
            <div className="text-center mb-3">
              <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-2" strokeWidth={1.5} />
              <h4 className="font-bold text-red-300">Ти вже в команді</h4>
              <p className="text-sm text-gray-400 mt-1">
                При створенні нової команди ти автоматично покинеш поточну. Продовжити?
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowLeaveWarningCreate(false); setShowCreate(true); }}
                className={`flex-1 py-3 font-bold text-sm ${BTN_DANGER}`}
              >
                Так, створити нову
              </button>
              <button
                onClick={() => setShowLeaveWarningCreate(false)}
                className={`flex-1 py-3 font-bold text-sm ${BTN_SECONDARY}`}
              >
                Скасувати
              </button>
            </div>
          </div>
        ) : showCreate ? (
          <div className={`${CARD} p-4`}>
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Створити команду</h3>
            </div>
            <div className="relative mb-3">
              <input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Назва команди"
                maxLength={30}
                className={`${INPUT} px-4 py-3`}
                autoFocus
              />
              {newTeamName.length > 0 && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-[10px] text-gray-500">{newTeamName.length}/30</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreateTeam}
                disabled={createLoading || newTeamName.trim().length < 2}
                className={`flex-1 py-3 text-sm flex items-center justify-center gap-2 ${BTN_PRIMARY}`}
              >
                {createLoading ? (
                  <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin inline-block" />
                ) : (
                  <><Check className="w-4 h-4" strokeWidth={2} /> Створити</>
                )}
              </button>
              <button
                onClick={() => { setShowCreate(false); setNewTeamName(""); }}
                className={`px-4 flex items-center justify-center ${BTN_SECONDARY}`}
                aria-label="Скасувати"
              >
                <X className="w-4 h-4" strokeWidth={2} />
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
            className="w-full bg-slate-900/60 border border-dashed border-slate-600/60 hover:border-emerald-400/40 py-4 rounded-2xl font-bold text-sm text-gray-400 hover:text-emerald-300 transition-colors active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" strokeWidth={2} /> Створити свою команду
          </button>
        )}
      </div>

      {/* Teams list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className={`${CARD} p-5 animate-pulse`}>
              <div className="h-5 bg-slate-800 rounded w-1/3 mb-2" />
              <div className="h-3 bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-16">
          <Shield className="w-12 h-12 text-slate-500 mx-auto mb-4" strokeWidth={1.5} />
          <p className="text-gray-400 font-medium">Команд поки немає</p>
        </div>
      ) : (
        <div className="space-y-2">
          {teams.map((t) => (
            <button
              key={t.id}
              onClick={() => { haptic("impact"); setSelectedTeam(t.id); }}
              className={`w-full text-left ${CARD} p-4 hover:border-slate-500/60 transition-colors active:scale-[0.98]`}
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0">
                  <Shield className="w-6 h-6 text-emerald-300" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{t.name}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-3 min-w-0">
                    <span className="flex items-center gap-1 shrink-0"><Users className="w-3.5 h-3.5" strokeWidth={2} />{t.member_count} гравців</span>
                    {t.captain_name && (
                      <span className="flex items-center gap-1 min-w-0"><Crown className="w-3.5 h-3.5 text-amber-300 shrink-0" strokeWidth={2} /><span className="truncate">{t.captain_name}</span></span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-emerald-300">{t.rating}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">очок</div>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-600 shrink-0" strokeWidth={2} />
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
  const [showCaptainLeaveOptions, setShowCaptainLeaveOptions] = useState(false);
  const [newCaptainId, setNewCaptainId] = useState(null);
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
    return <div className="animate-pulse"><div className="h-48 bg-slate-900/80 border border-slate-700/50 rounded-2xl" /></div>;
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <p className="text-gray-400">Команду не знайдено</p>
        <button onClick={onBack} className="text-emerald-300 text-sm mt-4 inline-flex items-center gap-1"><ChevronLeft className="w-4 h-4" strokeWidth={2} />Назад</button>
      </div>
    );
  }

  const { team, members, myApplication, isCaptain, pendingApps, myPlayerId, myTeamId } = data;
  const isMyTeam = members.some(m => m.id === myPlayerId);
  const hasTeam = !!myTeamId && myTeamId !== team.id;

  return (
    <div className="pb-6">
      <button onClick={onBack} className="flex items-center gap-1.5 text-emerald-300 text-sm font-medium mb-4 active:opacity-60">
        <ChevronLeft className="w-4 h-4" strokeWidth={2} />
        Назад
      </button>

      {/* Team header */}
      <div className={`relative ${CARD} overflow-hidden mb-5`}>
        <div className="camo absolute inset-x-0 top-0 h-1.5 opacity-70" />
        <div className="relative p-5">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-lg bg-slate-800 border border-slate-700/50 flex items-center justify-center shrink-0">
              <Shield className="w-8 h-8 text-emerald-300" strokeWidth={1.75} />
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-3xl font-bold uppercase tracking-wide leading-tight break-words">{team.name}</h2>
              {team.captain_name && (
                <p className="text-sm text-gray-400 flex items-center gap-1.5"><Crown className="w-3.5 h-3.5 text-amber-300" strokeWidth={2} />Капітан: {team.captain_name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-gray-500" strokeWidth={2} /><span className="font-mono font-bold">{members.length}</span><span className="text-gray-400 text-sm">гравців</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Star className="w-4 h-4 text-gray-500" strokeWidth={2} /><span className="font-mono font-bold text-emerald-300">{team.rating}</span><span className="text-gray-400 text-sm">очок</span>
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
              <div className="bg-slate-900/80 border border-red-400/40 rounded-2xl p-4">
                <div className="text-center mb-3">
                  <AlertTriangle className="w-8 h-8 text-red-300 mx-auto mb-2" strokeWidth={1.5} />
                  <h4 className="font-bold text-red-300">Ти вже в команді</h4>
                  <p className="text-sm text-gray-400 mt-1">
                    При подачі заявки ти автоматично покинеш свою поточну команду. Продовжити?
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowLeaveWarning(false); setShowApplyForm(true); }}
                    className={`flex-1 py-3 font-bold text-sm ${BTN_DANGER}`}
                  >
                    Так, покинути і подати
                  </button>
                  <button
                    onClick={() => setShowLeaveWarning(false)}
                    className={`flex-1 py-3 font-bold text-sm ${BTN_SECONDARY}`}
                  >
                    Скасувати
                  </button>
                </div>
              </div>
            ) : showApplyForm ? (
              <div className={`${CARD} p-4`}>
                <p className="text-sm font-medium text-gray-300 mb-2">Повідомлення для капітана (не обовʼязково):</p>
                <textarea
                  value={applyMessage}
                  onChange={(e) => setApplyMessage(e.target.value)}
                  placeholder="Привіт! Хочу приєднатись..."
                  className={`${INPUT} px-3 py-2 mb-3 resize-none h-20`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => doAction(() => applyToTeam(teamId, applyMessage), "✅ Заявку подано!")}
                    disabled={actionLoading}
                    className={`flex-1 py-3 text-sm flex items-center justify-center gap-2 ${BTN_PRIMARY}`}
                  >
                    {actionLoading ? "..." : <><PenLine className="w-4 h-4" strokeWidth={2} /> Подати заявку</>}
                  </button>
                  <button onClick={() => setShowApplyForm(false)} className={`px-4 flex items-center justify-center ${BTN_SECONDARY}`} aria-label="Скасувати"><X className="w-4 h-4" strokeWidth={2} /></button>
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
                className={`w-full py-4 text-[15px] flex items-center justify-center gap-2 ${BTN_PRIMARY}`}
              >
                <PenLine className="w-4 h-4" strokeWidth={2} /> Подати заявку в команду
              </button>
            )}
          </>
        )}

        {/* Pending application */}
        {myApplication && (
          <div className="bg-slate-900/80 border border-amber-400/30 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-amber-300 flex items-center gap-1.5"><Hourglass className="w-4 h-4" strokeWidth={2} />Заявка на розгляді</p>
              <p className="text-xs text-gray-500">Очікуй рішення капітана</p>
            </div>
            <button
              onClick={() => doAction(() => cancelApplication(teamId), "Заявку скасовано")}
              className={`text-xs font-semibold px-3 py-1.5 shrink-0 ${BTN_SECONDARY}`}
            >
              Скасувати
            </button>
          </div>
        )}

        {/* Leave team (non-captain) */}
        {isMyTeam && !isCaptain && (
          <button
            onClick={() => doAction(() => leaveTeam(), "Ти покинув команду")}
            disabled={actionLoading}
            className={`w-full py-3 font-bold text-sm flex items-center justify-center gap-2 ${BTN_DANGER}`}
          >
            <LogOut className="w-4 h-4" strokeWidth={2} /> Покинути команду
          </button>
        )}

        {/* Captain: leave/disband options */}
        {isMyTeam && isCaptain && (
          showCaptainLeaveOptions ? (
            <div className="bg-slate-900/80 border border-red-400/40 rounded-2xl p-4 space-y-3">
              <p className="text-sm font-semibold text-red-300">
                Ти капітан. Щоб вийти, обери:
              </p>
              {members.filter((m) => m.id !== myPlayerId).length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs text-gray-400">
                    1) Передати капітанство іншому гравцю і вийти з команди.
                  </p>
                  <div className="bg-slate-950/50 border border-slate-700/50 rounded-lg p-2 max-h-32 overflow-y-auto">
                    {members
                      .filter((m) => m.id !== myPlayerId)
                      .map((m) => (
                        <button
                          key={m.id}
                          onClick={() => setNewCaptainId(m.id)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded border text-xs mb-1 last:mb-0 ${
                            newCaptainId === m.id
                              ? "bg-emerald-400/10 border-emerald-400/40 text-emerald-200"
                              : "bg-slate-800/60 border-transparent text-gray-200"
                          }`}
                        >
                          <span>{m.nickname}</span>
                          <span className="font-mono text-[10px] text-gray-400 flex items-center gap-1">
                            <Star className="w-3 h-3" strokeWidth={2} />{m.rating}
                          </span>
                        </button>
                      ))}
                  </div>
                  <button
                    onClick={async () => {
                      if (!newCaptainId) return;
                      await doAction(
                        async () => {
                          await transferCaptain(teamId, newCaptainId);
                          await leaveTeam();
                        },
                        "Капітанство передано, ти покинув команду",
                      );
                      onBack();
                    }}
                    disabled={actionLoading || !newCaptainId}
                    className={`w-full py-2.5 text-xs flex items-center justify-center gap-2 ${BTN_PRIMARY}`}
                  >
                    <Crown className="w-4 h-4" strokeWidth={2} /> Передати капітанство і вийти
                  </button>
                </div>
              )}
              <div className="space-y-2">
                <p className="text-xs text-gray-400">
                  2) Розформувати команду. Всі гравці вийдуть з команди.
                </p>
                <button
                  onClick={async () => {
                    await doAction(
                      () => disbandTeam(teamId),
                      "Команду розформовано",
                    );
                    onBack();
                  }}
                  disabled={actionLoading}
                  className={`w-full py-2.5 text-xs font-bold flex items-center justify-center gap-2 ${BTN_DANGER}`}
                >
                  <Trash2 className="w-4 h-4" strokeWidth={2} /> Розформувати команду
                </button>
              </div>
              <button
                onClick={() => {
                  setShowCaptainLeaveOptions(false);
                  setNewCaptainId(null);
                }}
                className={`w-full py-2 text-xs font-medium ${BTN_SECONDARY}`}
              >
                Скасувати
              </button>
            </div>
          ) : (
            <button
              onClick={() => {
                haptic("impact");
                setShowCaptainLeaveOptions(true);
              }}
              className={`w-full py-3 font-bold text-sm flex items-center justify-center gap-2 ${BTN_DANGER}`}
            >
              <LogOut className="w-4 h-4" strokeWidth={2} /> Покинути / розформувати команду
            </button>
          )
        )}
      </div>

      {/* Captain: Pending applications */}
      {isCaptain && pendingApps.length > 0 && (
        <div className="bg-slate-900/80 border border-amber-400/30 rounded-2xl p-4 mb-5">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList className="w-5 h-5 text-amber-300" strokeWidth={2} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Заявки</h3>
            <span className={`${CHIP} text-amber-300 border-amber-400/30 bg-amber-400/10`}>{pendingApps.length}</span>
          </div>
          <div className="space-y-2">
            {pendingApps.map((app) => (
              <div key={app.id} className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-bold text-sm">{app.nickname}</span>
                    <span className="font-mono text-xs text-gray-500 ml-2 inline-flex items-center gap-1"><Star className="w-3 h-3" strokeWidth={2} />{app.rating} · {app.games_played}G</span>
                  </div>
                </div>
                {app.message && <p className="text-xs text-gray-400 mb-2 italic">"{app.message}"</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => doAction(() => resolveApplication(teamId, app.id, "accept"), "✅ Прийнято!")}
                    className={`flex-1 py-2 text-sm flex items-center justify-center gap-1.5 ${BTN_PRIMARY}`}
                  >
                    <Check className="w-4 h-4" strokeWidth={2} /> Прийняти
                  </button>
                  <button
                    onClick={() => doAction(() => resolveApplication(teamId, app.id, "reject"))}
                    className={`flex-1 py-2 text-sm font-bold flex items-center justify-center gap-1.5 ${BTN_DANGER}`}
                  >
                    <X className="w-4 h-4" strokeWidth={2} /> Відхилити
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
            <div className={`${CARD} p-4`}>
              <PlayerSearch
                value={inviteNick}
                onChange={(v) => setInviteNick(v)}
                onSelect={(p) => setInviteNick(p.nickname)}
                placeholder="Знайди гравця"
                icon={Search}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => doAction(() => inviteToTeam(teamId, inviteNick), "✅ Запрошення надіслано!")}
                  disabled={actionLoading || !inviteNick.trim()}
                  className={`flex-1 py-3 text-sm flex items-center justify-center gap-2 ${BTN_PRIMARY}`}
                >
                  <Mail className="w-4 h-4" strokeWidth={2} /> Запросити
                </button>
                <button onClick={() => { setShowInviteForm(false); setInviteNick(""); }} className={`px-4 flex items-center justify-center ${BTN_SECONDARY}`} aria-label="Скасувати"><X className="w-4 h-4" strokeWidth={2} /></button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { haptic("impact"); setShowInviteForm(true); }}
              className={`w-full py-3 font-bold text-sm flex items-center justify-center gap-2 ${BTN_SECONDARY}`}
            >
              <Mail className="w-4 h-4 text-emerald-300" strokeWidth={2} /> Запросити гравця в команду
            </button>
          )}
        </div>
      )}

      {/* Members list */}
      <div className={`${CARD} p-4`}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-300" strokeWidth={2} />
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-300">Склад</h3>
          </div>
          <span className={`${CHIP} text-gray-400 border-slate-600/50 bg-slate-700/30`}>{members.length}</span>
        </div>
        {members.length === 0 ? (
          <p className="text-center text-gray-500 py-4 text-sm">Команда порожня</p>
        ) : (
          <div className="space-y-1">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between py-2.5 px-2 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-8 h-8 rounded border flex items-center justify-center shrink-0 ${team.captain_id === m.id ? "bg-amber-400/10 border-amber-400/30" : "bg-slate-800 border-slate-700/50"}`}>
                    {team.captain_id === m.id
                      ? <Crown className="w-4 h-4 text-amber-300" strokeWidth={2} />
                      : <Shield className="w-4 h-4 text-gray-500" strokeWidth={2} />}
                  </div>
                  <div className="min-w-0 flex items-center">
                    <span className="text-sm font-medium truncate">{m.nickname}</span>
                    {team.captain_id === m.id && (
                      <span className={`${CHIP} ml-1.5 text-amber-300 border-amber-400/30 bg-amber-400/10`}>
                        Captain
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-emerald-300">
                      {m.rating}
                    </div>
                    <div className="text-[10px] text-gray-500">
                      {m.wins} перемог / {m.games_played} ігор
                    </div>
                  </div>
                  {isCaptain && m.id !== team.captain_id && (
                    <button
                      onClick={() =>
                        doAction(
                          () => kickFromTeam(teamId, m.id),
                          "Гравця вигнано з команди",
                        )
                      }
                      className={`ml-1 px-3 py-1.5 text-[11px] font-semibold ${BTN_DANGER}`}
                    >
                      Вигнати
                    </button>
                  )}
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
    <div className="bg-slate-900/80 border border-amber-400/30 rounded-2xl p-4">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-amber-400/10 border border-amber-400/30 flex items-center justify-center shrink-0">
          <Mail className="w-5 h-5 text-amber-300" strokeWidth={2} />
        </div>
        <div>
          <p className="font-bold text-sm">{invite.team_name}</p>
          <p className="text-xs text-gray-500">Від: {invite.invited_by_name}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onAccept} className={`flex-1 py-2.5 text-sm flex items-center justify-center gap-1.5 ${BTN_PRIMARY}`}><Check className="w-4 h-4" strokeWidth={2} /> Прийняти</button>
        <button onClick={onReject} className={`flex-1 py-2.5 text-sm font-bold flex items-center justify-center gap-1.5 ${BTN_SECONDARY}`}><X className="w-4 h-4" strokeWidth={2} /> Ні</button>
      </div>
    </div>
  );
}