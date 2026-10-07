import React from "react";
import RankInsignia from "../components/RankInsignia";

/**
 * Граничні суми очок (рейтинг) для рівнів:
 * L1: 0–50, L2: 51–100, L3: 101–150, L4: 151–200, L5: 201–300.
 * Далі крок у межах рівня зростає на +15 кожен наступний рівень (115, 130, 145, …).
 */

const LEVEL_SPANS_FIRST = [51, 50, 50, 50, 100]; // рівні 1–5

/**
 * @param {number} rating
 * @returns {{
 *   level: number,
 *   floor: number,
 *   span: number,
 *   progress: number,
 *   pointsToNext: number,
 *   nextLevel: number,
 * }}
 */
export function getPlayerLevelState(rating) {
  const r = Math.max(0, Math.floor(Number(rating) || 0));
  let floor = 0;
  let level = 1;

  for (let i = 0; i < LEVEL_SPANS_FIRST.length; i += 1) {
    const span = LEVEL_SPANS_FIRST[i];
    if (r < floor + span) {
      return {
        level,
        floor,
        span,
        progress: r - floor,
        pointsToNext: floor + span - r,
        nextLevel: level + 1,
      };
    }
    floor += span;
    level += 1;
  }

  let span = 115;
  for (;;) {
    if (r < floor + span) {
      return {
        level,
        floor,
        span,
        progress: r - floor,
        pointsToNext: floor + span - r,
        nextLevel: level + 1,
      };
    }
    floor += span;
    level += 1;
    span += 15;
  }
}

export function getAvatarForLevel(level) {
  const lv = Math.max(1, Math.floor(Number(level) || 1));

  // Tiered avatar: rank insignia + colour derived from level only.
  const tier =
    lv <= 1 ? { ring: "#8b876a", bg: "from-slate-600/40 to-slate-900/60" } :
    lv === 2 ? { ring: "#9fb4bd", bg: "from-sky-700/40 to-slate-900/60" } :
    lv === 3 ? { ring: "#a3b35a", bg: "from-emerald-700/40 to-slate-900/60" } :
    lv === 4 ? { ring: "#cf9f3e", bg: "from-amber-700/40 to-slate-900/60" } :
    lv === 5 ? { ring: "#bea3b3", bg: "from-violet-700/40 to-slate-900/60" } :
    lv <= 7 ? { ring: "#c9b67e", bg: "from-teal-700/40 to-slate-900/60" } :
    lv <= 10 ? { ring: "#de947e", bg: "from-rose-700/40 to-slate-900/60" } :
    lv <= 15 ? { ring: "#ddb85e", bg: "from-yellow-600/40 to-slate-900/60" } :
    { ring: "#c2d0d6", bg: "from-blue-600/40 to-slate-900/60" };

  return {
    ...tier,
    emoji: React.createElement(RankInsignia, { level: lv, color: tier.ring }),
  };
}
