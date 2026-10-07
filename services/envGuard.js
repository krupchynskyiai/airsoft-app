// ============================================
// Staging / production isolation for the Telegram bot
// ============================================

const config = require("../config");
const log = require("../utils/logger");

// Bot API methods that deliver something into a chat.
const OUTBOUND_METHODS = new Set([
  "sendMessage", "sendPhoto", "sendDocument", "sendVideo", "sendAnimation",
  "sendAudio", "sendVoice", "sendVideoNote", "sendMediaGroup", "sendLocation",
  "sendVenue", "sendContact", "sendPoll", "sendDice", "sendSticker",
  "forwardMessage", "forwardMessages", "copyMessage", "copyMessages",
]);

function isAllowedChat(chatId) {
  const id = String(chatId);
  if (config.PROD_CHANNEL_ID && id === String(config.PROD_CHANNEL_ID)) return false;
  if (!config.TEST_CHAT_IDS.length) return true;
  if (config.CHANNEL_ID && id === String(config.CHANNEL_ID)) return true;
  return config.TEST_CHAT_IDS.some((x) => String(x) === id);
}

// Outside production: drop messages to the prod channel and, when TEST_CHAT_IDS
// is set, to anyone not on the list. Dropped calls resolve with a stub message
// so callers (loops over players etc.) keep working.
function installOutboundGuard(bot) {
  if (config.IS_PROD) return;
  bot.api.config.use(async (prev, method, payload, signal) => {
    if (OUTBOUND_METHODS.has(method) && payload && payload.chat_id != null && !isAllowedChat(payload.chat_id)) {
      log.info(`[${config.APP_ENV}] Blocked ${method}`, { chat_id: payload.chat_id });
      return {
        ok: true,
        result: { message_id: 0, date: Math.floor(Date.now() / 1000), chat: { id: payload.chat_id }, text: payload.text },
      };
    }
    return prev(method, payload, signal);
  });
}

// Route announcements to a forum topic when CHANNEL_ID is a group with topics.
function installAnnouncementTopic(bot) {
  if (!config.CHANNEL_ID || !config.CHANNEL_THREAD_ID) return;
  bot.api.config.use((prev, method, payload, signal) => {
    if (
      OUTBOUND_METHODS.has(method) &&
      payload &&
      String(payload.chat_id) === String(config.CHANNEL_ID) &&
      payload.message_thread_id == null
    ) {
      payload = { ...payload, message_thread_id: config.CHANNEL_THREAD_ID };
    }
    return prev(method, payload, signal);
  });
}

// Resolve the real bot username and make sure a non-production instance
// is not running with the production bot token.
async function verifyBotIdentity(bot) {
  const me = await bot.api.getMe();
  if (config.BOT_USERNAME && config.BOT_USERNAME !== me.username) {
    log.warn("BOT_USERNAME does not match token, using real username", {
      configured: config.BOT_USERNAME,
      actual: me.username,
    });
  }
  config.BOT_USERNAME = me.username;

  if (!config.IS_PROD && me.username === config.PROD_BOT_USERNAME) {
    throw new Error(
      `APP_ENV=${config.APP_ENV} is running with the production bot @${me.username}. ` +
        "Create a separate bot in @BotFather and set its BOT_TOKEN.",
    );
  }
  if (!config.IS_PROD && config.PROD_CHANNEL_ID && String(config.CHANNEL_ID) === String(config.PROD_CHANNEL_ID)) {
    throw new Error(`APP_ENV=${config.APP_ENV} has CHANNEL_ID set to the production channel.`);
  }
  log.info("Bot identity", { env: config.APP_ENV, username: me.username });
  return me;
}

module.exports = { installOutboundGuard, installAnnouncementTopic, verifyBotIdentity };
