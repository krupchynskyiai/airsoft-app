import React from "react";

export default function Contacts() {
  return (
    <div className="pb-6">
      <div className="mb-5">
        <h2 className="text-2xl font-black">Контакти</h2>
        <p className="text-sm text-gray-500">
          Тут можна стежити за новинами клубу та спільнотою.
        </p>
      </div>

      <div className="space-y-3">
        <div className="bg-slate-800/70 border border-emerald-600/40 rounded-2xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 flex items-center justify-center text-xl">
              📢
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-300">
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
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-xs font-bold text-black shadow-lg active:scale-95 transition-transform"
          >
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

