const path = require("node:path");

const ROOT_DIR = path.resolve(__dirname, "..");

module.exports = {
  ROOT_DIR,
  TEMP_DIR: path.join(ROOT_DIR, "temp"),
  SESSION_DIR: path.resolve(ROOT_DIR, process.env.SESSION_DIR || "session"),
  BOT_NAME: process.env.BOT_NAME || "NectarBot",
  PREFIX: process.env.PREFIX || ".",
  SELF_CHAT: process.env.SELF_CHAT !== "false",
  MAX_INPUT_BYTES: 24 * 1024 * 1024,
  MAX_GIF_SECONDS: 8,
  MAX_SOUND_STICKER_SECONDS: 10,
  SOUND_STICKER_FPS: 10,
  FFMPEG_TIMEOUT_MS: 60000,
  QR_QUIET_ZONE: 4,
};
