function esc(text) {
    if (!text) return "";
    return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
  }
  
  module.exports = { esc };