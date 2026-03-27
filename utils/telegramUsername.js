/**
 * Telegram public usernames: 5–32 chars, Latin letters, digits, underscore.
 * We avoid treating auto-generated nicknames like player_123 as usernames.
 */
const TG_HANDLE_RE = /^@?[a-zA-Z0-9_]{5,32}$/;
const AUTO_PLAYER_NICK_RE = /^player_\d+$/;

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
  normalizeTelegramUsername,
  telegramUsernameFromNickname,
  resolveTelegramUsername,
};
