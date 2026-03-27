/**
 * Telegram public usernames: 5–32 chars, Latin letters, digits, underscore.
 * We avoid treating auto-generated nicknames like player_123 as usernames.
 */
const TG_HANDLE_RE = /^@?[a-zA-Z0-9_]{5,32}$/;
const AUTO_PLAYER_NICK_RE = /^player_\d+$/;

/** Stable numeric Telegram user id for DB (avoids string vs number mismatches). */
function telegramIdNumber(id) {
  if (id == null || id === "") return null;
  let v = id;
  if (typeof v === "bigint") {
    v = Number(v);
  }
  const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Display nickname without user input: @username from Telegram, else player_<id> (unique).
 */
function defaultDisplayNicknameFromTelegramUser(tgUser) {
  const tid = telegramIdNumber(tgUser?.id);
  if (!tid) return null;
  const un = normalizeTelegramUsername(tgUser?.username);
  if (un) return `@${un}`;
  return `player_${tid}`;
}

function normalizeTelegramUsername(raw) {
  if (raw == null || raw === "") return null;
  const t = String(raw).replace(/^@/, "").trim().toLowerCase();
  return t || null;
}

/** If nickname looks like a Telegram @handle, return normalized username; else null. */
function telegramUsernameFromNickname(nickname) {
  if (!nickname || typeof nickname !== "string") return null;
  const n = nickname.trim();
  if (AUTO_PLAYER_NICK_RE.test(n)) return null;
  if (!TG_HANDLE_RE.test(n)) return null;
  return normalizeTelegramUsername(n);
}

/** Prefer username from Telegram API; otherwise derive from nickname when it looks like a handle. */
function resolveTelegramUsername(apiUsername, nickname) {
  const fromApi = normalizeTelegramUsername(apiUsername);
  if (fromApi) return fromApi;
  return telegramUsernameFromNickname(nickname);
}

module.exports = {
  telegramIdNumber,
  defaultDisplayNicknameFromTelegramUser,
  normalizeTelegramUsername,
  telegramUsernameFromNickname,
  resolveTelegramUsername,
};
