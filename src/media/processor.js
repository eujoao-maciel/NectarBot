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
    "fps=10,scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000",
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
      "fps=12,scale=480:-2:flags=lanczos",
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
  withMediaFile,
};
