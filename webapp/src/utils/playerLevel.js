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
