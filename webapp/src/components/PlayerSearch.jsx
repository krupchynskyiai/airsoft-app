import React, { useState, useEffect, useRef } from "react";
import { searchPlayers } from "../api";
import { UserRound, Search, Handshake, Shield } from "lucide-react";

// Legacy callers pass an emoji string; map it to a lucide icon. A component or element is rendered as-is.
const EMOJI_ICONS = { "👤": UserRound, "🔍": Search, "🤝": Handshake };

function renderIcon(icon) {
  if (React.isValidElement(icon)) return icon;
  const Icon = typeof icon === "string" || icon == null ? EMOJI_ICONS[icon] || UserRound : icon;
  return <Icon className="w-4 h-4 text-gray-500" strokeWidth={2} />;
}

export default function PlayerSearch({ value, onChange, onSelect, placeholder = "Нікнейм гравця", icon = "👤" }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);
  const wrapperRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("touchstart", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("touchstart", handleClick);
    };
  }, []);

  // Sync external value
  useEffect(() => {
    if (value !== undefined && value !== query) {
      setQuery(value);
    }
  }, [value]);

  function handleInput(val) {
    setQuery(val);
    if (onChange) onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.length < 1) {
      setResults([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await searchPlayers(val);
        setResults(res);
        setShowDropdown(res.length > 0);
      } catch (e) {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }

  function handleSelect(player) {
    setQuery(player.nickname);
    setShowDropdown(false);
    if (onChange) onChange(player.nickname);
    if (onSelect) onSelect(player);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <label className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1.5 block">
        {placeholder}
      </label>
      <div className="relative">
        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">{renderIcon(icon)}</div>
        <input
          type="text"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => { if (results.length > 0) setShowDropdown(true); }}
          placeholder={placeholder}
          className="w-full bg-slate-900/80 border border-slate-600/60 rounded-lg pl-10 pr-4 py-3 text-[15px] focus:border-emerald-400/60 focus:outline-none transition-colors placeholder:text-gray-600"
          autoComplete="off"
        />
        {loading && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <span className="w-4 h-4 border-2 border-gray-600 border-t-gray-300 rounded-full animate-spin inline-block" />
          </div>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-600/60 rounded-lg shadow-xl shadow-black/40 overflow-hidden max-h-60 overflow-y-auto">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => handleSelect(p)}
              className="w-full text-left px-4 py-3 flex items-center justify-between hover:bg-slate-700/50 active:bg-slate-700 transition-colors border-b border-slate-700/30 last:border-0"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-slate-800 border border-slate-700/50 flex items-center justify-center">
                  <Shield className="w-4 h-4 text-gray-500" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-sm font-semibold">{p.nickname}</div>
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider">
                    {p.team_id ? "В команді" : "Solo"}
                  </div>
                </div>
              </div>
              <span className="font-mono text-xs text-emerald-300 font-bold">{p.rating} pts</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}