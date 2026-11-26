const fs = require("node:fs");
const {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto,
} = require("@whiskeysockets/baileys");
const { attachAudio, detachAudio, installStickerAudioPatch } = require("./sticker-audio");

const AUDIO_MIMETYPE = "audio/ogg; codecs=opus";

async function sendSoundSticker(sock, chatId, stickerPath, audioPath, quoted) {
  installStickerAudioPatch();
  if (typeof sock.waUploadToServer !== "function") {
    throw new Error("A conexão do Baileys não expõe o envio de mídia necessário para figurinhas com áudio.");
  }
  const uploadOptions = { upload: sock.waUploadToServer };
  const [audioContent, stickerContent] = await Promise.all([
    prepareWAMessageMedia(
      { audio: fs.readFileSync(audioPath), mimetype: AUDIO_MIMETYPE, ptt: true },
      uploadOptions,
    ),
    prepareWAMessageMedia(
      { sticker: fs.readFileSync(stickerPath), isAnimated: true },
      uploadOptions,
    ),
  ]);

  const uploadedAudio = audioContent.audioMessage;
  const audioMessage = proto.Message.AudioMessage.create({
    url: uploadedAudio.url,
    mimetype: AUDIO_MIMETYPE,
    fileSha256: uploadedAudio.fileSha256,
    fileLength: uploadedAudio.fileLength,
    seconds: uploadedAudio.seconds,
    ptt: true,
    mediaKey: uploadedAudio.mediaKey,
    fileEncSha256: uploadedAudio.fileEncSha256,
    directPath: uploadedAudio.directPath,
    mediaKeyTimestamp: uploadedAudio.mediaKeyTimestamp || Math.floor(Date.now() / 1000),
    waveform: uploadedAudio.waveform,
  });
  const sticker = stickerContent.stickerMessage;
  sticker.isAnimated = true;
  sticker.width = 512;
  sticker.height = 512;

  attachAudio(sticker.fileSha256, proto.Message.AudioMessage.encode(audioMessage).finish());
  try {
    const message = generateWAMessageFromContent(
      chatId,
      { stickerMessage: sticker },
      { quoted, userJid: sock.user?.id },
    );
    await sock.relayMessage(chatId, message.message, { messageId: message.key.id });
  } finally {
    detachAudio(sticker.fileSha256);
  }
}

module.exports = { sendSoundSticker };
