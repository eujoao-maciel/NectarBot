const { PREFIX } = require("../config");

function parseCommand(text) {
  if (!text.startsWith(PREFIX)) return null;
  const [command = "", ...args] = text.slice(PREFIX.length).trim().split(/\s+/);
  return { command: command.toLowerCase(), args: args.join(" ") };
}

function menuText() {
  const { BOT_NAME } = require("../config");
  return [
    `[ 🦇 ] *${BOT_NAME}*`,
    "",
    `${PREFIX}menu — ver este menu`,
    `${PREFIX}s    — criar figurinha de uma imagem ou vídeo`,
    `${PREFIX}v    — transformar um vídeo em GIF`,
    "",
    "Anexe a mídia ao comando ou responda à mensagem com a mídia.",
  ].join("\n");
}

module.exports = { parseCommand, menuText };
