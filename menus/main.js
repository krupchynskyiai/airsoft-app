const { InlineKeyboard } = require("grammy");
const config = require("../config");

function mainMenu(ctx) {
  const kb = new InlineKeyboard()
    .text("👤 Профіль", "m_profile")
    .text("🏆 Рейтинг", "m_leaderboard")
    .row()
    .text("🏠 Команди", "m_teams")
    .text("📅 Сезон", "m_season")
    .row()
    .text("🎮 Мої ігри", "m_my_games")
    .row();

  if (config.isAdmin(ctx)) {
    kb.text("➕ Створити гру", "m_create_game")
      .text("🏁 Керувати грою", "m_manage_games")
      .row()
      .text("🏠 Нова команда", "m_create_team")
      .text("📅 Новий сезон", "m_create_season")
      .row()
      .text("⬆️ Додати очки", "m_add_pts")
      .text("⬇️ Зняти очки", "m_rm_pts")
      .row();
  }

  return kb;
}

async function sendMenu(ctx, text) {
  return ctx.reply(text, {
    parse_mode: "MarkdownV2",
    reply_markup: mainMenu(ctx),
  });
}

module.exports = { mainMenu, sendMenu };