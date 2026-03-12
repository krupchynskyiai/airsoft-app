import React, { useState } from "react";
import { adminCreateGame, adminCreateTeam, adminAddPoints } from "../api";
import { useTelegram } from "../hooks/useTelegram";

export default function Admin() {
  const [section, setSection] = useState(null);
  const { haptic } = useTelegram();

  const sections = [
    { id: "game", icon: "🎮", label: "Створити гру", desc: "Нова подія з датою, локацією та форматом", color: "from-emerald-600/20 to-teal-700/10", border: "border-emerald-700/30" },
    { id: "team", icon: "🏠", label: "Створити команду", desc: "Додати нову команду до клубу", color: "from-blue-600/20 to-indigo-700/10", border: "border-blue-700/30" },
    { id: "points", icon: "📊", label: "Змінити очки", desc: "Додати або зняти рейтинг гравцю", color: "from-amber-600/20 to-orange-700/10", border: "border-amber-700/30" },
  ];

  return (
    <div className="pb-4">
      {/* Header */}
      <div className="mb-5">
        <h2 className="text-2xl font-black">Адмін панель</h2>
        <p className="text-sm text-gray-500">Керування клубом</p>
      </div>

      {!section ? (
        <div className="space-y-3">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => { haptic("impact"); setSection(s.id); }}
              className={`w-full text-left bg-gradient-to-br ${s.color} border ${s.border} p-5 rounded-2xl transition-all active:scale-[0.98] hover:border-slate-500/50`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-slate-800/60 flex items-center justify-center text-2xl shadow-inner">
                  {s.icon}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-[15px]">{s.label}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{s.desc}</div>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-gray-500">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </button>
          ))}

          {/* Quick stats */}
          <div className="mt-6 bg-slate-800/40 rounded-2xl p-4 border border-slate-700/30">
            <div className="flex items-center gap-2 mb-3">
              <span>💡</span>
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Підказки</span>
            </div>
            <div className="space-y-2 text-sm text-gray-500">
              <p>• Створюй гру заздалегідь щоб гравці встигли записатись</p>
              <p>• Random Teams розподілить гравців автоматично</p>
              <p>• Очки нараховуються автоматично після гри</p>
            </div>
          </div>
        </div>
      ) : (
        <div>
          <button
            onClick={() => { haptic("impact"); setSection(null); }}
            className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-5 active:opacity-60 transition-opacity"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Назад
          </button>

          {section === "game" && <CreateGameForm onDone={() => setSection(null)} />}
          {section === "team" && <CreateTeamForm onDone={() => setSection(null)} />}
          {section === "points" && <PointsForm onDone={() => setSection(null)} />}
        </div>
      )}
    </div>
  );
}

// ---- Create Game ----
function CreateGameForm({ onDone }) {
  const [form, setForm] = useState({
    date: "", time: "", location: "", game_mode: "team_vs_team", total_rounds: 3,
  });
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(1);
  const { haptic, showAlert } = useTelegram();

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    if (!form.date || !form.location) return showAlert("Заповни дату і локацію");
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
    { id: "team_vs_team", icon: "⚔️", label: "Team vs Team", desc: "Постійні команди" },
    { id: "random_teams", icon: "🎲", label: "Random Teams", desc: "Автоматичний розподіл" },
    { id: "ffa", icon: "👤", label: "Free For All", desc: "Кожен сам за себе" },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-emerald-600/20 flex items-center justify-center text-2xl">🎮</div>
        <div>
          <h3 className="text-lg font-black">Нова гра</h3>
          <p className="text-xs text-gray-500">Крок {step} з 3</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className={`flex-1 h-1 rounded-full transition-all duration-300 ${s <= step ? "bg-emerald-500" : "bg-slate-700"}`} />
        ))}
      </div>

      {step === 1 && (
        <div className="space-y-4">
          <FormInput icon="📅" label="Дата" value={form.date} onChange={(v) => set("date", v)} placeholder="14 квітня 2026" />
          <FormInput icon="🕐" label="Час" value={form.time} onChange={(v) => set("time", v)} placeholder="10:00" />
          <FormInput icon="📍" label="Локація" value={form.location} onChange={(v) => set("location", v)} placeholder="Airsoft Field" />
          <button
            onClick={() => { if (form.date && form.location) { haptic("impact"); setStep(2); } }}
            disabled={!form.date || !form.location}
            className="w-full bg-emerald-600 disabled:bg-slate-700 disabled:text-gray-500 py-4 rounded-2xl font-bold transition-all active:scale-[0.98]"
          >
            Далі →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-gray-400 mb-2 font-medium">Обери формат гри</p>
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => { haptic("impact"); set("game_mode", m.id); }}
              className={`w-full p-4 rounded-2xl border-2 flex items-center gap-4 transition-all active:scale-[0.98] ${
                form.game_mode === m.id
                  ? "border-emerald-500/60 bg-emerald-950/30"
                  : "border-slate-700/40 bg-slate-800/40"
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                form.game_mode === m.id ? "bg-emerald-600/20" : "bg-slate-700/60"
              }`}>
                {m.icon}
              </div>
              <div className="text-left flex-1">
                <div className="font-bold">{m.label}</div>
                <div className="text-xs text-gray-500">{m.desc}</div>
              </div>
              {form.game_mode === m.id && <span className="text-emerald-400 text-lg">✓</span>}
            </button>
          ))}
          <button
            onClick={() => { haptic("impact"); setStep(3); }}
            className="w-full bg-emerald-600 py-4 rounded-2xl font-bold transition-all active:scale-[0.98] mt-2"
          >
            Далі →
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <p className="text-sm text-gray-400 mb-2 font-medium">Кількість раундів</p>
          <div className="grid grid-cols-4 gap-2">
            {[1, 3, 5, 7].map((n) => (
              <button
                key={n}
                onClick={() => { haptic("impact"); set("total_rounds", n); }}
                className={`py-4 rounded-2xl text-lg font-black border-2 transition-all active:scale-95 ${
                  form.total_rounds === n
                    ? "border-emerald-500/60 bg-emerald-950/30 text-emerald-400"
                    : "border-slate-700/40 bg-slate-800/40 text-gray-400"
                }`}
              >
                {n}
              </button>
            ))}
          </div>

          {/* Summary */}
          <div className="bg-slate-800/60 rounded-2xl p-4 border border-slate-700/30 mt-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-2">Підсумок</p>
            <div className="space-y-1.5 text-sm">
              <p>📅 {form.date} {form.time && `о ${form.time}`}</p>
              <p>📍 {form.location}</p>
              <p>🎯 {modes.find((m) => m.id === form.game_mode)?.label}</p>
              <p>🔄 {form.total_rounds} раундів</p>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={loading}
            className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 py-4 rounded-2xl font-bold text-[15px] shadow-lg shadow-emerald-900/30 transition-all active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Створення...
              </span>
            ) : (
              "✅ Створити гру"
            )}
          </button>
        </div>
      )}

      {step > 1 && (
        <button
          onClick={() => { haptic("impact"); setStep(step - 1); }}
          className="w-full text-center text-gray-500 text-sm mt-3 py-2"
        >
          ← Назад
        </button>
      )}
    </div>
  );
}

// ---- Create Team ----
function CreateTeamForm({ onDone }) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const { haptic, showAlert } = useTelegram();

  async function submit() {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await adminCreateTeam(name.trim());
      haptic("success");
      showAlert("✅ Команду створено!");
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
        <div className="w-12 h-12 rounded-2xl bg-blue-600/20 flex items-center justify-center text-2xl">🏠</div>
        <div>
          <h3 className="text-lg font-black">Нова команда</h3>
          <p className="text-xs text-gray-500">Додай команду до клубу</p>
        </div>
      </div>

      <div className="space-y-4">
        <FormInput icon="🏷" label="Назва команди" value={name} onChange={setName} placeholder="Team Alpha" />
        <button
          onClick={submit}
          disabled={loading || !name.trim()}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-gray-500 py-4 rounded-2xl font-bold transition-all active:scale-[0.98]"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            </span>
          ) : (
            "✅ Створити команду"
          )}
        </button>
      </div>
    </div>
  );
}

// ---- Points Form ----
function PointsForm({ onDone }) {
  const [nick, setNick] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const { haptic, showAlert } = useTelegram();

  async function submit(sign) {
    const amt = parseInt(amount);
    if (!nick.trim() || isNaN(amt) || amt <= 0) return showAlert("Заповни поля коректно");
    setLoading(true);
    try {
      const res = await adminAddPoints(nick.trim(), sign * amt);
      haptic("success");
      showAlert(`✅ Новий рейтинг: ${res.newRating}`);
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
        <div className="w-12 h-12 rounded-2xl bg-amber-600/20 flex items-center justify-center text-2xl">📊</div>
        <div>
          <h3 className="text-lg font-black">Змінити очки</h3>
          <p className="text-xs text-gray-500">Додати або зняти рейтинг</p>
        </div>
      </div>

      <div className="space-y-4">
        <FormInput icon="👤" label="Нікнейм гравця" value={nick} onChange={setNick} placeholder="Falcon" />
        <FormInput icon="🔢" label="Кількість очок" value={amount} onChange={setAmount} placeholder="10" type="number" />

        <div className="grid grid-cols-2 gap-3 mt-2">
          <button
            onClick={() => submit(1)}
            disabled={loading || !nick.trim() || !amount}
            className="bg-gradient-to-r from-emerald-600 to-teal-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-gray-500 py-4 rounded-2xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? <Spinner /> : <><span>⬆️</span> Додати</>}
          </button>
          <button
            onClick={() => submit(-1)}
            disabled={loading || !nick.trim() || !amount}
            className="bg-gradient-to-r from-red-700 to-red-800 disabled:from-slate-700 disabled:to-slate-700 disabled:text-gray-500 py-4 rounded-2xl font-bold transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {loading ? <Spinner /> : <><span>⬇️</span> Зняти</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---- Shared components ----
function FormInput({ icon, label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5 block">{label}</label>
      <div className="relative">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-lg">{icon}</div>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-800/60 border-2 border-slate-700/40 rounded-2xl pl-12 pr-4 py-3.5 text-[15px] focus:border-emerald-500/60 focus:outline-none focus:ring-2 focus:ring-emerald-500/10 transition-all placeholder:text-gray-600"
        />
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />;
}