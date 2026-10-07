const config = require("../config");
const log = require("./logger");

// Grammy methods that actually deliver something to a Telegram user/chat.
// When NOTIFICATIONS_DISABLED is on, every one of these becomes a no-op so
// that a test DB full of real telegram_ids can't accidentally message real
// users. Edits are also suppressed to avoid errors after the original send
// was skipped.
const INTERCEPTED_METHODS = new Set([
  "sendMessage",
  "sendPhoto",
  "sendDocument",
  "sendAnimation",
  "sendVideo",
  "sendVoice",
  "sendAudio",
  "sendSticker",
  "sendMediaGroup",
  "sendLocation",
  "sendVenue",
  "sendContact",
  "sendDice",
  "sendPoll",
  "sendChatAction",
  "forwardMessage",
  "copyMessage",
  "pinChatMessage",
  "unpinChatMessage",
  "unpinAllChatMessages",
  "editMessageText",
  "editMessageCaption",
  "editMessageMedia",
  "editMessageReplyMarkup",
  "deleteMessage",
]);

function fakeResult(method, payload) {
  if (method === "sendMediaGroup") return [];
  if (
    method === "sendChatAction" ||
    method === "deleteMessage" ||
    method === "unpinChatMessage" ||
    method === "unpinAllChatMessages" ||
    method === "pinChatMessage" ||
    method.startsWith("edit")
  ) {
    return true;
  }
  return {
    message_id: 0,
    date: Math.floor(Date.now() / 1000),
    chat: { id: payload?.chat_id ?? 0, type: "private" },
  };
}

function shortPreview(payload) {
  const text = payload?.text || payload?.caption || "";
  if (!text) return "";
  const single = String(text).replace(/\s+/g, " ").trim();
  return single.length > 80 ? `${single.slice(0, 77)}...` : single;
}

/**
 * Install a grammy API transformer that drops every outbound user-visible
 * call when `config.NOTIFICATIONS_DISABLED` is true.
 *
 * Optionally respects `config.NOTIFICATIONS_ALLOW_ADMINS`: when set to "true",
 * admins (from `ADMIN_IDS`) still receive messages so you can sanity-check
 * flows while the kill-switch is active.
 */
function installNotificationGuard(bot, label = "bot") {
  if (!bot?.api?.config?.use) {
    log.warn("installNotificationGuard: bot has no api.config.use", { label });
    return;
  }

  bot.api.config.use(async (prev, method, payload, signal) => {
    if (!config.NOTIFICATIONS_DISABLED) return prev(method, payload, signal);
    if (!INTERCEPTED_METHODS.has(method)) return prev(method, payload, signal);

    const chatId = Number(payload?.chat_id ?? 0);
    if (
      config.NOTIFICATIONS_ALLOW_ADMINS &&
      chatId &&
      Array.isArray(config.ADMINS) &&
      config.ADMINS.includes(chatId)
    ) {
      return prev(method, payload, signal);
    }

    log.warn("Notification suppressed (NOTIFICATIONS_DISABLED)", {
      bot: label,
      method,
      chat_id: chatId || null,
      preview: shortPreview(payload),
    });

    return { ok: true, result: fakeResult(method, payload) };
  });

  if (config.NOTIFICATIONS_DISABLED) {
    log.warn("Notification guard ACTIVE — outgoing Telegram messages are suppressed", {
      bot: label,
      allow_admins: !!config.NOTIFICATIONS_ALLOW_ADMINS,
    });
  }
}

module.exports = { installNotificationGuard };
