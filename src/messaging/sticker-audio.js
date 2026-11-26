const { proto } = require("@whiskeysockets/baileys");

const AUDIO_FIELD_NUMBER = 26;
const AUDIO_FIELD_TAG = (AUDIO_FIELD_NUMBER << 3) | 2;
const pendingAudio = new Map();
const PATCHED = Symbol.for("nectarbot.stickerAudioPatch");

const hashKey = (hash) => Buffer.from(hash).toString("base64");

function attachAudio(stickerHash, encodedAudioMessage) {
  pendingAudio.set(hashKey(stickerHash), encodedAudioMessage);
}

function detachAudio(stickerHash) {
  pendingAudio.delete(hashKey(stickerHash));
}

function installStickerAudioPatch() {
  const stickerProto = proto.Message.StickerMessage;
  if (stickerProto.encode[PATCHED]) return;
  const originalEncode = stickerProto.encode;

  function encodeWithAudio(message, writer) {
    const result = originalEncode.call(this, message, writer);
    if (message?.fileSha256) {
      const audio = pendingAudio.get(hashKey(message.fileSha256));
      if (audio) result.uint32(AUDIO_FIELD_TAG).bytes(audio);
    }
    return result;
  }

  encodeWithAudio[PATCHED] = true;
  stickerProto.encode = encodeWithAudio;
}

module.exports = { AUDIO_FIELD_NUMBER, AUDIO_FIELD_TAG, attachAudio, detachAudio, installStickerAudioPatch };
