const fs = require("node:fs");
const path = require("node:path");
const { PREFIX, MAX_INPUT_BYTES } = require("../config");
const { getText } = require("../messaging/messages");
const { parseCommand, menuText } = require("./parser");
const {
  getMediaSource,
  findFfmpeg,
  convertToSticker,
  convertVideoToGifVideo,
  withMediaFile,
} = require("../media/processor");

async function handleCommand(sock, raw) {
  const parsed = parseCommand(getText(raw).trim());
  if (!parsed) return;
  const chatId = raw.key.remoteJid;
  const reply = (body) =>
    sock.sendMessage(chatId, { text: body }, { quoted: raw });
  if (parsed.command === "menu" || parsed.command === "ajuda")
    return reply(menuText());
  if (parsed.command !== "s" && parsed.command !== "v") {
    return reply(
      `Comando não reconhecido. Envie *${PREFIX}menu* para ver as opções.`,
    );
  }

  const source = await getMediaSource({ _raw: raw });
  if (!source)
    return reply(
      parsed.command === "s"
        ? `Envie uma imagem ou vídeo com *${PREFIX}s*, ou responda a uma mensagem com mídia.`
        : `Envie um vídeo com *${PREFIX}v*, ou responda a uma mensagem com vídeo.`,
    );
  if (parsed.command === "v" && source.type !== "video")
    return reply("O comando .v precisa de um vídeo.");
  if (source.buffer.length > MAX_INPUT_BYTES)
    return reply("O arquivo passa do limite de 24 MB.");
  const ffmpeg = findFfmpeg();
  if (!ffmpeg)
    return reply("Não encontrei o ffmpeg. Instale-o e reinicie o bot.");

  await reply(
    parsed.command === "s"
      ? "Criando sua figurinha..."
      : "Preparando o vídeo em formato GIF...",
  );
  await withMediaFile(source, async (inputPath, dir) => {
    if (parsed.command === "s") {
      const outputPath = path.join(dir, "sticker.webp");
      await convertToSticker(source, inputPath, outputPath, ffmpeg);
      await sock.sendMessage(chatId, { sticker: fs.readFileSync(outputPath) });
    } else {
      const outputPath = path.join(dir, "gif.mp4");
      await convertVideoToGifVideo(inputPath, outputPath, ffmpeg);
      await sock.sendMessage(chatId, {
        video: fs.readFileSync(outputPath),
        mimetype: "video/mp4",
        gifPlayback: true,
      });
    }
  });
}

module.exports = { handleCommand };
