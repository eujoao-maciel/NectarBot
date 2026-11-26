const fs = require("node:fs");
const path = require("node:path");
const { promisify } = require("node:util");
const { execFile, execFileSync } = require("node:child_process");
const { downloadMediaMessage } = require("@whiskeysockets/baileys");
const { extractQuotedMessage, mediaInfo } = require("../messaging/messages");
const {
  TEMP_DIR,
  MAX_INPUT_BYTES,
  MAX_GIF_SECONDS,
  FFMPEG_TIMEOUT_MS,
} = require("../config");

const execFileAsync = promisify(execFile);
const STICKER_SIZE = 512;
const GIF_SIZE = 480;

function stickerVideoFilter() {
  return `fps=10,scale=${STICKER_SIZE}:${STICKER_SIZE}:force_original_aspect_ratio=increase,crop=${STICKER_SIZE}:${STICKER_SIZE}`;
}

function gifVideoFilter() {
  return `fps=12,scale=${GIF_SIZE}:${GIF_SIZE}:force_original_aspect_ratio=increase:flags=lanczos,crop=${GIF_SIZE}:${GIF_SIZE}`;
}

async function getMediaSource(message) {
  for (const raw of [message._raw, extractQuotedMessage(message._raw)]) {
    const info = mediaInfo(raw);
    if (!info) continue;
    const buffer = await downloadMediaMessage(
      raw,
      "buffer",
      {},
      {
        logger: { trace() {}, debug() {}, info() {}, warn() {}, error() {} },
      },
    );
    if (buffer?.length) return { buffer, ...info };
  }
  return null;
}

function extensionFor(mime, type) {
  if (type === "video") return "mp4";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  return "jpg";
}

function findFfmpeg() {
  for (const candidate of [process.env.FFMPEG_PATH, "ffmpeg"].filter(Boolean)) {
    try {
      execFileSync(candidate, ["-version"], { stdio: "ignore", timeout: 4000 });
      return candidate;
    } catch (_) {
      /* Tenta o próximo executável. */
    }
  }
  return null;
}

async function convertToSticker(source, inputPath, outputPath, ffmpeg) {
  const args = ["-hide_banner", "-loglevel", "error", "-y", "-i", inputPath];
  if (source.type === "video") args.push("-t", "5");
  args.push(
    "-vf",
    stickerVideoFilter(),
    "-vcodec",
    "libwebp",
    "-lossless",
    "0",
    "-q:v",
    source.type === "video" ? "55" : "65",
    "-compression_level",
    "6",
    "-loop",
    "0",
    "-an",
    outputPath,
  );
  await execFileAsync(ffmpeg, args, {
    timeout: FFMPEG_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
  });
}

async function convertVideoToGifVideo(inputPath, outputPath, ffmpeg) {
  await execFileAsync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inputPath,
      "-t",
      String(MAX_GIF_SECONDS),
      "-vf",
      gifVideoFilter(),
      "-an",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      outputPath,
    ],
    { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
  );
}

async function extractStickerAudio(inputPath, outputPath, ffmpeg) {
  try {
    await execFileAsync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
      "-map", "0:a:0", "-vn", "-t", "5", "-ac", "1", "-ar", "48000",
      "-c:a", "libopus", "-b:a", "32k", "-application", "voip", "-f", "ogg", outputPath,
    ], { timeout: FFMPEG_TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 });
  } catch (error) {
    if (/matches no streams|does not contain any stream|Stream specifier .* matches no streams/i.test(error.stderr || "")) {
      throw new Error("Esse vídeo não tem uma faixa de áudio para colocar na figurinha.");
    }
    throw error;
  }
}

async function withMediaFile(source, action) {
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  const dir = fs.mkdtempSync(path.join(TEMP_DIR, "job-"));
  const inputPath = path.join(
    dir,
    `input.${extensionFor(source.mime, source.type)}`,
  );
  try {
    if (source.buffer.length > MAX_INPUT_BYTES)
      throw new Error("O arquivo passa do limite de 24 MB.");
    fs.writeFileSync(inputPath, source.buffer);
    await action(inputPath, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  getMediaSource,
  findFfmpeg,
  convertToSticker,
  convertVideoToGifVideo,
  extractStickerAudio,
  withMediaFile,
  stickerVideoFilter,
  gifVideoFilter,
};
