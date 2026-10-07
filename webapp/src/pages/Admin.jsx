import React, { useEffect, useState } from "react";
import {
  adminCreateGame,
  adminCreateTeam,
  adminAddPoints,
  adminAddToBlacklist,
  adminRemoveFromBlacklist,
  adminGetLootRequests,
  adminDeactivateLoot,
  adminGetSurveyResponses,
} from "../api";
import { useTelegram } from "../hooks/useTelegram";
import PlayerSearch from "../components/PlayerSearch";
import {
  Gamepad2,
  BarChart3,
  Ban,
  Gift,
  PenLine,
  Lightbulb,
  ChevronRight,
  ChevronLeft,
  CalendarDays,
  Clock,
  MapPin,
  Timer,
  Users,
  Wallet,
  Swords,
  Dices,
  UserRound,
  Check,
  Crosshair,
  ClipboardList,
  RotateCw,
  Shield,
  X,
  Hash,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Receipt,
  RefreshCw,
} from "lucide-react";

export default function Admin() {
  const [section, setSection] = useState(null);
  const { haptic } = useTelegram();

  const sections = [
    {
      id: "game",
      icon: Gamepad2,
      label: "Створити гру",
      desc: "Нова подія з датою, локацією та форматом",
      tone: "text-emerald-300 border-emerald-400/30 bg-emerald-400/10",
    },
    {
      id: "points",
      icon: BarChart3,
      label: "Змінити очки",
      desc: "Додати або зняти рейтинг гравцю",
      tone: "text-amber-300 border-amber-400/30 bg-amber-400/10",
    },
    {
      id: "blacklist",
      icon: Ban,
      label: "Blacklist",
      desc: "Проблемні гравці, яким заборонено грати",
      tone: "text-red-300 border-red-400/30 bg-red-400/10",
    },
    {
      id: "loot",
      icon: Gift,
      label: "Запити бонусів",
      desc: "Підтвердження використання бонусів гравцями",
      tone: "text-sky-300 border-sky-400/30 bg-sky-400/10",
    },
    {
      id: "survey",
      icon: PenLine,
      label: "Опитування",
      desc: "Відповіді гравців по досвіду",
      tone: "text-teal-300 border-teal-400/30 bg-teal-400/10",
    },
  ];

  return (
    <div className="pb-4">
      <div className="mb-5">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide text-gray-100">
          Штаб
        </h2>
        <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mt-1">
          Адмін панель · керування клубом
        </p>
        <div className="camo h-1 w-24 rounded-sm mt-2 opacity-70" />
      </div>

      {!section ? (
        <div className="space-y-2">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                haptic("impact");
                setSection(s.id);
              }}
              className="w-full text-left bg-slate-900/80 border border-slate-700/50 p-4 rounded-2xl transition-all ease-smooth active:scale-[0.98] hover:border-slate-500/60"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-11 h-11 rounded-lg border flex items-center justify-center ${s.tone}`}
                >
                  <s.icon className="w-5 h-5" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15px] text-gray-100">{s.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.desc}</div>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-500" strokeWidth={2} />
              </div>
            </button>
          ))}

          <div className="mt-6 bg-slate-900/80 rounded-2xl p-4 border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">
                Підказки
              </span>
            </div>
            <div className="space-y-2 text-sm text-gray-500">
              <p>• Створюй гру заздалегідь щоб гравці встигли записатись</p>
              <p>• Random Teams розподілить гравців автоматично</p>
              <p>• Очки нараховуються автоматично після гри</p>
              <p>• Команди створюються в розділі Команди</p>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => {
              haptic("impact");
              setSection(null);
            }}
            className="flex items-center gap-1.5 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-5 active:opacity-60 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" strokeWidth={2.5} />
            Назад
          </button>

          {section === "game" && (
            <CreateGameForm onDone={() => setSection(null)} />
          )}
          {section === "points" && (
            <PointsForm onDone={() => setSection(null)} />
          )}
          {section === "blacklist" && (
            <BlacklistForm onDone={() => setSection(null)} />
          )}
          {section === "loot" && (
            <LootRequestsForm onDone={() => setSection(null)} />
          )}
          {section === "survey" && (
            <SurveyResponsesForm onDone={() => setSection(null)} />
          )}
        </div>
      )}
    </div>
  );
}

// ---- Create Game ----
function CreateGameForm({ onDone }) {
  const [form, setForm] = useState({
    date: "",
    time: "",
    location: "",
    duration: "",
    game_mode: "team_vs_team",
    max_players: 18,
    payment: 600,
    score_round_outcomes_only: false,
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const { haptic, showAlert } = useTelegram();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.date || !form.location)
      return showAlert("Заповни дату і локацію");
    setLoading(true);
    try {
      await adminCreateGame(form);
      haptic("success");
      showAlert("✅ Гру створено!");
      onDone();
    } catch (e) {
      showAlert(e.message);
      haptic("error");
    } finally {
      setLoading(false);
    }
  }

  const modes = [
    {
      id: "team_vs_team",
      icon: Swords,
      label: "Команда проти команди",
      desc: "Постійні команди",
    },
    {
      id: "random_teams",
      icon: Dices,
      label: "Випадкові команди",
      desc: "Автоматичний розподіл",
    },
    { id: "ffa", icon: UserRound, label: "Free For All", desc: "Кожен сам за себе" },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-lg border flex items-center justify-center text-emerald-300 border-emerald-400/30 bg-emerald-400/10">
          <Gamepad2 className="w-5 h-5" strokeWidth={2} />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gray-100">Нова гра</h3>
          <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-gray-500">Крок {step} з 2</p>
        </div>
      </div>

      <div className="flex gap-1.5 mb-6">
        {[1, 2].map((s) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded-sm transition-all duration-300 ease-smooth ${s <= step ? "bg-emerald-400" : "bg-slate-700"}`}
          />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <FormInput
            icon={<CalendarDays className="w-4 h-4 text-gray-500" strokeWidth={2} />}
            label="Дата"
            value={form.date}
            onChange={(v) => set("date", v)}
            placeholder="14 квітня 2026"
          />
          <FormInput
            icon={<Clock className="w-4 h-4 text-gray-500" strokeWidth={2} />}
            label="Час"
            value={form.time}
            onChange={(v) => set("time", v)}
            placeholder="10:00"
          />
          <FormInput
            icon={<MapPin className="w-4 h-4 text-gray-500" strokeWidth={2} />}
            label="Локація"
            value={form.location}
            onChange={(v) => set("location", v)}
            placeholder="Airsoft Field"
          />
          <FormInput
            icon={<Timer className="w-4 h-4 text-gray-500" strokeWidth={2} />}
            label="Тривалість гри"
            value={form.duration}
            onChange={(v) => set("duration", v)}
            placeholder="Наприклад: 4 години або 10:00–14:00"
          />
          <FormInput
            icon={<Users className="w-4 h-4 text-gray-500" strokeWidth={2} />}
            label="Максимальна кількість гравців"
            value={form.max_players}
            onChange={(v) => set("max_players", v)}
            placeholder="20"
            type="number"
          />
          <FormInput
            icon={<Wallet className="w-4 h-4 text-gray-500" strokeWidth={2} />}
            label="Вартість участі, грн."
            value={form.payment}
            onChange={(v) => set("payment", v)}
            placeholder="20"
            type="number"
          />
          <button
            onClick={() => {
              if (form.date && form.location) {
                haptic("impact");
                setStep(2);
              }
            }}
            disabled={!form.date || !form.location}
            className="w-full bg-emerald-400 text-slate-950 disabled:bg-slate-800 disabled:text-gray-500 py-4 rounded-lg font-bold uppercase tracking-wide transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            Далі
            <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-300 mb-2">
            Обери формат гри
          </p>
          <label className="flex items-start gap-3 p-4 rounded-2xl border border-slate-700/50 bg-slate-900/80 cursor-pointer active:scale-[0.99] transition-transform">
            <input
              type="checkbox"
              checked={form.score_round_outcomes_only}
              onChange={(e) => set("score_round_outcomes_only", e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-slate-600 text-emerald-600 focus:ring-emerald-500/40"
            />
            <div>
              <div className="font-bold text-sm">Лише результат раундів</div>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                Рейтинг після гри — лише за підсумком раундів (перемоги команди та нічия). Смерті й виживання в раундах не змінюють нараховані очки.
              </p>
            </div>
          </label>

          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                haptic("impact");
                set("game_mode", m.id);
              }}
              className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all ease-smooth active:scale-[0.98] ${
                form.game_mode === m.id
                  ? "border-emerald-400/60 bg-emerald-400/10"
                  : "border-slate-700/50 bg-slate-900/80"
              }`}
            >
              <div
                className={`w-11 h-11 rounded-lg border flex items-center justify-center ${
                  form.game_mode === m.id
                    ? "text-emerald-300 border-emerald-400/30 bg-emerald-400/10"
                    : "text-gray-400 border-slate-600/60 bg-slate-800"
                }`}
              >
                <m.icon className="w-5 h-5" strokeWidth={2} />
              </div>
              <div className="text-left flex-1">
                <div className="font-bold text-gray-100">{m.label}</div>
                <div className="text-xs text-gray-500">{m.desc}</div>
              </div>
              {form.game_mode === m.id && (
                <Check className="w-5 h-5 text-emerald-300" strokeWidth={2.5} />
              )}
            </button>
          ))}

          <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-700/50 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <ClipboardList className="w-5 h-5 text-emerald-300" strokeWidth={2} />
              <p className="text-xs text-gray-300 uppercase tracking-wider font-bold">
                Підсумок
              </p>
            </div>
            <div className="space-y-1.5 text-sm text-gray-200">
              <p className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                <span>
                  {form.date} {form.time && `о ${form.time}`}
                </span>
              </p>
              <p className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                <span>{form.location}</span>
              </p>
              <p className="flex items-center gap-2">
                <Crosshair className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                <span>{modes.find((m) => m.id === form.game_mode)?.label}</span>
              </p>
              {form.score_round_outcomes_only && (
                <p className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                  <span>Скоринг: лише перемоги раундів / нічия</span>
                </p>
              )}
              <p className="flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                <span>До {form.max_players} гравців</span>
              </p>
              <p className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                <span>Вартість участі {form.payment} грн</span>
              </p>
              <p className="flex items-center gap-2">
                <Timer className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                <span>Тривалість: {form.duration || "не вказано"}</span>
              </p>
              <p className="flex items-center gap-2">
                <RotateCw className="w-4 h-4 text-gray-500 shrink-0" strokeWidth={2} />
                <span>Раунди — по ходу гри</span>
              </p>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-emerald-400 text-slate-950 py-4 rounded-lg font-bold text-[15px] uppercase tracking-wide transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                Створення...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <CheckCircle2 className="w-5 h-5" strokeWidth={2} />
                Створити гру
              </span>
            )}
          </button>
        </div>
      )}

      {step > 1 && (
        <button
          onClick={() => {
            haptic("impact");
            setStep(step - 1);
          }}
          className="w-full flex items-center justify-center gap-1.5 text-gray-500 text-xs font-bold uppercase tracking-wider mt-3 py-2"
        >
          <ChevronLeft className="w-4 h-4" strokeWidth={2} />
          Назад
        </button>
      )}
    </div>
  );
}

// ---- Points Form ----
function PointsForm({ onDone }) {
  const [nick, setNick] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const { haptic, showAlert } = useTelegram();

  async function submit(sign) {
    const amt = parseInt(amount);
    const nickname = selectedPlayer?.nickname || nick.trim();
    if (!nickname || isNaN(amt) || amt <= 0)
      return showAlert("Заповни поля коректно");
    setLoading(true);
    try {
      const res = await adminAddPoints(nickname, sign * amt);
      haptic("success");
      showAlert(`✅ ${nickname}: новий рейтинг ${res.newRating}`);
      onDone();
    } catch (e) {
      showAlert(e.message);
      haptic("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-lg border flex items-center justify-center text-amber-300 border-amber-400/30 bg-amber-400/10">
          <BarChart3 className="w-5 h-5" strokeWidth={2} />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gray-100">Змінити очки</h3>
          <p className="text-xs text-gray-500">Додати або зняти рейтинг</p>
        </div>
      </div>

      <div className="space-y-4">
        <PlayerSearch
          value={nick}
          onChange={(v) => {
            setNick(v);
            setSelectedPlayer(null);
          }}
          onSelect={(p) => {
            setNick(p.nickname);
            setSelectedPlayer(p);
          }}
          placeholder="Нікнейм гравця"
          icon={<UserRound className="w-4 h-4 text-gray-500" strokeWidth={2} />}
        />

        {/* Selected player info */}
        {selectedPlayer && (
          <div className="flex items-center gap-3 bg-emerald-400/10 border border-emerald-400/30 rounded-lg px-4 py-2.5">
            <div className="w-8 h-8 rounded-lg border border-emerald-400/30 bg-emerald-400/10 flex items-center justify-center text-emerald-300">
              <Shield className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <span className="text-sm font-bold">
                {selectedPlayer.nickname}
              </span>
              <span className="font-mono text-[11px] text-gray-500 ml-2">
                Rating: {selectedPlayer.rating}
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedPlayer(null);
                setNick("");
              }}
              className="text-gray-500 p-1"
              aria-label="Скинути"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        )}

        <FormInput
          icon={<Hash className="w-4 h-4 text-gray-500" strokeWidth={2} />}
          label="Кількість очок"
          value={amount}
          onChange={setAmount}
          placeholder="10"
          type="number"
        />

        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            onClick={() => submit(1)}
            disabled={loading || (!nick.trim() && !selectedPlayer) || !amount}
            className="bg-emerald-400 text-slate-950 disabled:bg-slate-800 disabled:text-gray-500 py-4 rounded-lg font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <Spinner />
            ) : (
              <>
                <ArrowUp className="w-4 h-4" strokeWidth={2.5} /> Додати
              </>
            )}
          </button>
          <button
            onClick={() => submit(-1)}
            disabled={loading || (!nick.trim() && !selectedPlayer) || !amount}
            className="bg-red-500/15 border border-red-400/40 text-red-300 disabled:bg-slate-800 disabled:border-slate-700/50 disabled:text-gray-500 py-4 rounded-lg font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <Spinner />
            ) : (
              <>
                <ArrowDown className="w-4 h-4" strokeWidth={2.5} /> Зняти
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Blacklist Form ----
function BlacklistForm({ onDone }) {
  const [nick, setNick] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { haptic, showAlert } = useTelegram();

  async function add() {
    if (!selectedPlayer?.id) {
      return showAlert("Вибери гравця");
    }
    setLoading(true);
    try {
      await adminAddToBlacklist(selectedPlayer.id, reason || null);
      haptic("success");
      showAlert("⛔ Гравця додано в blacklist");
      onDone();
    } catch (e) {
      showAlert(e.message);
      haptic("error");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    if (!selectedPlayer?.id) {
      return showAlert("Вибери гравця");
    }
    setLoading(true);
    try {
      await adminRemoveFromBlacklist(selectedPlayer.id);
      haptic("success");
      showAlert("✅ Гравця прибрано з blacklist");
      onDone();
    } catch (e) {
      showAlert(e.message);
      haptic("error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-lg border flex items-center justify-center text-red-300 border-red-400/30 bg-red-400/10">
          <Ban className="w-5 h-5" strokeWidth={2} />
        </div>
        <div>
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gray-100">Blacklist</h3>
          <p className="text-xs text-gray-500">
            Заборона участі у всіх іграх
          </p>
        </div>
      </div>

      <div className="space-y-4">
        <PlayerSearch
          value={nick}
          onChange={(v) => {
            setNick(v);
            setSelectedPlayer(null);
          }}
          onSelect={(p) => {
            setNick(p.nickname);
            setSelectedPlayer(p);
          }}
          placeholder="Нікнейм гравця"
          icon={<UserRound className="w-4 h-4 text-gray-500" strokeWidth={2} />}
        />

        {selectedPlayer && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-400/40 rounded-lg px-4 py-2.5">
            <div className="w-8 h-8 rounded-lg border border-red-400/30 bg-red-400/10 flex items-center justify-center text-red-300">
              <Shield className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="flex-1">
              <span className="text-sm font-bold">
                {selectedPlayer.nickname}
              </span>
              <span className="font-mono text-[11px] text-gray-500 ml-2">
                Rating: {selectedPlayer.rating}
              </span>
            </div>
            <button
              onClick={() => {
                setSelectedPlayer(null);
                setNick("");
              }}
              className="text-gray-500 p-1"
              aria-label="Скинути"
            >
              <X className="w-4 h-4" strokeWidth={2} />
            </button>
          </div>
        )}

        <div>
          <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1.5 block">
            Причина (необов'язково)
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Наприклад: постійні no-show, порушення правил безпеки..."
            className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg px-3 py-2 text-sm focus:border-red-400/60 focus:outline-none transition-all placeholder:text-gray-600 resize-none h-20"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            onClick={add}
            disabled={loading || !selectedPlayer}
            className="bg-red-500/15 border border-red-400/40 text-red-300 disabled:bg-slate-800 disabled:border-slate-700/50 disabled:text-gray-500 py-4 rounded-lg font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <Spinner />
            ) : (
              <>
                <Ban className="w-4 h-4" strokeWidth={2} /> Додати
              </>
            )}
          </button>
          <button
            onClick={remove}
            disabled={loading || !selectedPlayer}
            className="bg-slate-800 border border-slate-600/60 text-gray-200 disabled:border-slate-700/50 disabled:text-gray-500 py-4 rounded-lg font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? (
              <Spinner />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" strokeWidth={2} /> Прибрати
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Loot requests ----
function LootRequestsForm({ onDone }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolvingId, setResolvingId] = useState(null);
  const [confirmReward, setConfirmReward] = useState(null);
  const [resultModal, setResultModal] = useState(null);
  const { haptic, showAlert } = useTelegram();

  async function loadRequests() {
    try {
      setLoading(true);
      const data = await adminGetLootRequests();
      setRequests(data.requests || []);
    } catch (e) {
      showAlert(e.message || "Не вдалося завантажити запити");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, []);

  async function confirmUse(rw) {
    try {
      setResolvingId(rw.id);
      await adminDeactivateLoot(rw.id);
      setRequests((prev) => prev.filter((x) => x.id !== rw.id));
      haptic("success");
      setResultModal({
        title: "Готово",
        message: "Бонус позначено як використаний.",
      });
    } catch (e) {
      haptic("error");
      setResultModal({
        title: "Помилка",
        message: e.message || "Не вдалося підтвердити використання",
      });
    } finally {
      setResolvingId(null);
      setConfirmReward(null);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-lg border flex items-center justify-center text-sky-300 border-sky-400/30 bg-sky-400/10">
          <Gift className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gray-100">Запити бонусів</h3>
          <p className="text-xs text-gray-500">Тільки адмін списує бонус після фактичного використання</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={loadRequests}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600/60 text-gray-200 text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2} />
          {loading ? "Оновлення..." : "Оновити"}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600/60 text-gray-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
          Закрити
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Завантаження запитів...</div>
      ) : requests.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 text-sm text-gray-400">
          Немає запитів на використання бонусів.
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((rw) => (
            <div
              key={rw.id}
              className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-gray-100">{rw.player_name || rw.player_callsign || rw.player_nickname}</div>
                  <div className="text-xs text-gray-300">{rw.reward_title || rw.reward_key}</div>
                  {rw.reward_description ? (
                    <div className="text-[11px] text-gray-500 mt-0.5">
                      {rw.reward_description}
                    </div>
                  ) : null}
                  <div className="font-mono text-[10px] uppercase tracking-wider text-gray-500 mt-1">
                    rarity: {rw.rarity} · id: {rw.id}
                  </div>
                  {rw.game_id ? (
                    <div className="text-[11px] text-amber-300 mt-1 flex items-center gap-1.5">
                      <Gamepad2 className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                      <span>
                      Гра #{rw.game_id}
                      {rw.game_date ? ` · ${rw.game_date}` : ""}
                      {rw.game_time ? ` ${rw.game_time}` : ""}
                      {rw.game_location ? ` · ${rw.game_location}` : ""}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-gray-500 mt-1">
                      Гра не вказана
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setConfirmReward(rw)}
                  disabled={resolvingId === rw.id}
                  className="px-3 py-2 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold active:scale-[0.98] disabled:opacity-50 shrink-0"
                >
                  {resolvingId === rw.id ? "..." : "Підтвердити"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmReward && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative z-50 w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-600/60 p-5 text-center shadow-2xl">
            <div className="w-11 h-11 mx-auto mb-3 rounded-lg border border-emerald-400/30 bg-emerald-400/10 flex items-center justify-center text-emerald-300">
              <Receipt className="w-5 h-5" strokeWidth={2} />
            </div>
            <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider mb-2">
              Підтвердження
            </h4>
            <p className="text-sm text-gray-200 mb-1">
              Позначити бонус як використаний?
            </p>
            <p className="text-xs text-gray-400 mb-1">
              {confirmReward.player_name || confirmReward.player_callsign || confirmReward.player_nickname}
            </p>
            <p className="text-xs text-sky-300 mb-4">
              {confirmReward.reward_title || confirmReward.reward_key}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmReward(null)}
                className="py-2.5 rounded-lg bg-slate-800 border border-slate-600/60 text-gray-200 text-xs font-bold"
              >
                Скасувати
              </button>
              <button
                type="button"
                onClick={() => confirmUse(confirmReward)}
                disabled={resolvingId === confirmReward.id}
                className="py-2.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold active:scale-[0.98] disabled:opacity-50"
              >
                {resolvingId === confirmReward.id ? "..." : "Підтвердити"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resultModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative z-50 w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-600/60 p-5 text-center shadow-2xl">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-200 mb-2">{resultModal.title}</h4>
            <p className="text-xs text-gray-400 mb-4">{resultModal.message}</p>
            <button
              type="button"
              onClick={() => setResultModal(null)}
              className="px-6 py-2.5 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold active:scale-[0.98]"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SurveyResponsesForm({ onDone }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const { showAlert } = useTelegram();

  const overallLabel = {
    great: "Дуже кайф",
    ok: "Норм",
    meh: "Так собі",
    bad: "Не зайшло",
  };
  const appLabel = {
    helps_a_lot: "Дуже допомагає",
    rather_yes: "Скоріше так",
    rather_no: "Скоріше ні",
    not_needed: "Взагалі не потрібен",
  };
  const likesLabel = {
    atmosphere: "Атмосфера",
    community: "Люди / комʼюніті",
    organization: "Організація",
    formats: "Формати ігор",
    location: "Локація",
    gameplay: "Динаміка / геймплей",
    other: "Інше",
  };
  const improvementLabel = {
    team_balance: "Баланс команд",
    rules_clarity: "Чіткість правил",
    refereeing: "Суддівство / контроль",
    pace: "Темп гри",
    respawns_mechanics: "Респавни / механіки",
    other: "Інше",
  };

  async function load() {
    try {
      setLoading(true);
      const res = await adminGetSurveyResponses(200, 0);
      setItems(res.items || []);
    } catch (e) {
      showAlert(e.message || "Не вдалося завантажити відповіді");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function fmtDate(v) {
    if (!v) return "—";
    const d = new Date(String(v).replace(" ", "T"));
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("uk-UA");
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-11 h-11 rounded-lg border flex items-center justify-center text-teal-300 border-teal-400/30 bg-teal-400/10">
          <PenLine className="w-5 h-5" strokeWidth={2} />
        </div>
        <div className="flex-1">
          <h3 className="font-display text-xl font-bold uppercase tracking-wide text-gray-100">Відповіді опитування</h3>
          <p className="text-xs text-gray-500">Доступно тільки адміну</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={load}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600/60 text-gray-200 text-xs font-bold uppercase tracking-wider disabled:opacity-50 flex items-center gap-1.5"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2} />
          {loading ? "Оновлення..." : "Оновити"}
        </button>
        <button
          onClick={onDone}
          className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600/60 text-gray-200 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" strokeWidth={2} />
          Закрити
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-gray-400">Завантаження...</div>
      ) : items.length === 0 ? (
        <div className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4 text-sm text-gray-400">
          Відповідей ще немає.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="bg-slate-900/80 border border-slate-700/50 rounded-2xl p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-bold text-gray-100">{it.player_name}</div>
                <div className="font-mono text-[10px] text-gray-500">{fmtDate(it.created_at)}</div>
              </div>
              <div className="font-mono text-[10px] text-gray-500 mb-2">
                @{it.telegram_username || "—"} · {it.survey_key}
              </div>
              <div className="space-y-1 text-xs text-gray-200">
                <div><span className="text-gray-500">Досвід:</span> {overallLabel[it.overall_experience] || it.overall_experience}</div>
                <div><span className="text-gray-500">Подобається:</span> {(it.likes || []).map((x) => likesLabel[x] || x).join(", ") || "—"}</div>
                <div><span className="text-gray-500">Болить:</span> {it.pain_points || "—"}</div>
                <div><span className="text-gray-500">Покращити:</span> {(it.improvements || []).map((x) => improvementLabel[x] || x).join(", ") || "—"}</div>
                <div><span className="text-gray-500">Про додаток:</span> {appLabel[it.app_helpfulness] || it.app_helpfulness}</div>
                <div><span className="text-gray-500">Чого бракує:</span> {it.missing_feature || "—"}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Shared ----
function FormInput({
  icon,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-bold uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
          {icon}
        </div>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-900/80 border border-slate-700/50 rounded-lg pl-11 pr-4 py-3.5 text-[15px] focus:border-emerald-400/60 focus:outline-none transition-all placeholder:text-gray-600"
        />
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin opacity-80" />
  );
}
