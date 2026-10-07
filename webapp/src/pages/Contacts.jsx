import React from "react";
import { Megaphone, ExternalLink } from "lucide-react";

export default function Contacts() {
  return (
    <div className="pb-6">
      <div className="mb-5">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">Контакти</h2>
        <p className="text-sm text-gray-500">
          Тут можна стежити за новинами клубу та спільнотою.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative overflow-hidden bg-slate-900/80 border border-slate-700/50 rounded-2xl p-4">
          <span className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-400" />
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-400/10 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <Megaphone className="w-5 h-5 text-emerald-300" strokeWidth={2} />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-200">
                Новини клубу
              </h3>
              <p className="text-xs text-gray-400">
                Офіційні анонси ігор, зміни, важлива інформація.
              </p>
            </div>
          </div>
          <a
            href="https://t.me/banana_airsoft_news"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-400 text-slate-950 text-xs font-bold active:scale-[0.98] transition-transform"
          >
            <ExternalLink className="w-3.5 h-3.5" strokeWidth={2} />
            Відкрити канал
          </a>
        </div>

        {/* Чат/паблік — поки приховано, лінк закоментований */}
        {/*
        <div className="bg-slate-800/70 border border-slate-700/60 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-700/60 flex items-center justify-center text-xl">
              💬
            </div>
            <div>
              <h3 className="text-sm font-bold text-gray-200">
                Чат та спільнота
              </h3>
              <p className="text-xs text-gray-400">
                Обговорення ігор, питання, меми та багато іншого.
              </p>
            </div>
          </div>
          <a
            href="https://t.me/banana_airsoft_public"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 text-xs font-bold text-gray-200 active:scale-95 transition-transform"
          >
            Відкрити чат
          </a>
        </div>
        */}

        <div className="mt-4 text-[11px] text-gray-500">
          Якщо посилання не відкривається всередині Telegram, натисни{" "}
          <span className="text-emerald-400 font-semibold">⋯</span> у куті та
          обери відкриття в окремому вікні.
        </div>
      </div>
    </div>
  );
}

