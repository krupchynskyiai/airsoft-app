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

  // Tiered avatar system: recognizable by emoji + consistent color theme.
  // (User cannot edit; derived from level only.)
  if (lv <= 1) return { emoji: "🪖", ring: "#94a3b8", bg: "from-slate-600/30 to-slate-900/30" };
  if (lv === 2) return { emoji: "🥾", ring: "#38bdf8", bg: "from-sky-600/30 to-slate-900/30" };
  if (lv === 3) return { emoji: "🛡️", ring: "#22c55e", bg: "from-emerald-600/30 to-slate-900/30" };
  if (lv === 4) return { emoji: "⚔️", ring: "#f59e0b", bg: "from-amber-600/30 to-slate-900/30" };
  if (lv === 5) return { emoji: "🎖️", ring: "#a855f7", bg: "from-violet-600/30 to-slate-900/30" };
  if (lv <= 7) return { emoji: "🦅", ring: "#06b6d4", bg: "from-cyan-600/30 to-slate-900/30" };
  if (lv <= 10) return { emoji: "🐺", ring: "#ef4444", bg: "from-rose-600/30 to-slate-900/30" };
  if (lv <= 15) return { emoji: "👑", ring: "#fbbf24", bg: "from-yellow-500/30 to-slate-900/30" };
  return { emoji: "💎", ring: "#60a5fa", bg: "from-blue-500/30 to-slate-900/30" };
}
