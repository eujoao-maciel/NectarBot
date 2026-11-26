const { getContentType } = require("@whiskeysockets/baileys");

function unwrapMessage(message = {}) {
  let current = message;
  for (let i = 0; i < 5; i += 1) {
    const type = getContentType(current);
    const wrapped = current[type]?.message;
    if (!wrapped) break;
    current = wrapped;
  }
  return current;
}

function getText(raw) {
  const message = unwrapMessage(raw.message);
  const type = getContentType(message);
  const content = message[type] || {};
  return message.conversation || content.text || content.caption || "";
}

function extractQuotedMessage(raw) {
  const message = unwrapMessage(raw.message);
  const type = getContentType(message);
  const context = message[type]?.contextInfo;
  if (!context?.quotedMessage) return null;
  return {
    key: {
      remoteJid: raw.key.remoteJid,
      id: context.stanzaId,
      participant: context.participant,
      fromMe: false,
    },
    message: context.quotedMessage,
  };
}

function mediaInfo(raw) {
  if (!raw?.message) return null;
  const message = unwrapMessage(raw.message);
  const type = getContentType(message);
  const content = message[type] || {};
  if (type === "imageMessage")
    return { type: "image", mime: content.mimetype || "image/jpeg" };
  if (type === "videoMessage")
    return { type: "video", mime: content.mimetype || "video/mp4" };
  if (type === "stickerMessage")
    return { type: "image", mime: content.mimetype || "image/webp" };
  return null;
}

module.exports = { unwrapMessage, getText, extractQuotedMessage, mediaInfo };
