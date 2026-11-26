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
  extractStickerAudio,
  withMediaFile,
} = require("../media/processor");
const { sendSoundSticker } = require("../messaging/send-sound-sticker");

async function handleCommand(sock, raw) {
  const parsed = parseCommand(getText(raw).trim());
  if (!parsed) return;
  const chatId = raw.key.remoteJid;
  const reply = (body) =>
    sock.sendMessage(chatId, { text: body }, { quoted: raw });
  if (parsed.command === "menu" || parsed.command === "ajuda")
    return reply(menuText());
  const isGifCommand = parsed.command === "g" || parsed.command === "v";
  if (
    parsed.command !== "s" &&
    parsed.command !== "sa" &&
    !isGifCommand
  ) {
    return reply(
      `Comando não reconhecido. Envie *${PREFIX}menu* para ver as opções.`,
    );
  }

  const source = await getMediaSource({ _raw: raw });
  if (!source) {
    if (parsed.command === "sa") {
      return reply(
        `Envie um vídeo com *${PREFIX}sa* ou responda a uma mensagem com vídeo.`,
      );
    }
    return reply(
      parsed.command === "s"
        ? `Envie uma imagem ou vídeo com *${PREFIX}s*, ou responda a uma mensagem com mídia.`
        : `Envie um vídeo com *${PREFIX}${parsed.command}*, ou responda a uma mensagem com vídeo.`,
    );
  }
  if (
    (isGifCommand || parsed.command === "sa") && source.type !== "video"
  ) {
    return reply(
      parsed.command === "sa"
        ? "O comando .sa precisa de um vídeo."
        : `O comando .${parsed.command} precisa de um vídeo.`,
    );
  }
  if (source.buffer.length > MAX_INPUT_BYTES)
    return reply("O arquivo passa do limite de 24 MB.");
  const ffmpeg = findFfmpeg();
  if (!ffmpeg)
    return reply("Não encontrei o ffmpeg. Instale-o e reinicie o bot.");

  await reply(
    parsed.command === "s"
      ? "[ 🦇 ] criando sua figurinha..."
      : parsed.command === "sa"
        ? "[ 🦇 ] criando figurinha áudio..."
        : "[ 🦇 ] preparando GIF...",
  );
  await withMediaFile(source, async (inputPath, dir) => {
    if (parsed.command === "s") {
      const outputPath = path.join(dir, "sticker.webp");
      await convertToSticker(source, inputPath, outputPath, ffmpeg);
      await sock.sendMessage(chatId, { sticker: fs.readFileSync(outputPath) });
    } else if (parsed.command === "sa") {
      const stickerPath = path.join(dir, "sticker.webp");
      const audioPath = path.join(dir, "audio.ogg");
      await convertToSticker(source, inputPath, stickerPath, ffmpeg);
      await extractStickerAudio(inputPath, audioPath, ffmpeg);
      await sendSoundSticker(sock, chatId, stickerPath, audioPath, raw);
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
