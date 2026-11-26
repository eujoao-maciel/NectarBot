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
  MAX_SOUND_STICKER_SECONDS,
  SOUND_STICKER_FPS,
  FFMPEG_TIMEOUT_MS,
} = require("../config");

const execFileAsync = promisify(execFile);
const STICKER_SIZE = 512;
const GIF_SIZE = 480;

function stickerVideoFilter(segment) {
  const trim = segment ? `setpts=PTS-STARTPTS,trim=duration=${segment.duration},` : "";
  return `${trim}fps=${SOUND_STICKER_FPS},scale=${STICKER_SIZE}:${STICKER_SIZE}:force_original_aspect_ratio=increase,crop=${STICKER_SIZE}:${STICKER_SIZE}`;
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

function commonStickerSegment(streams, formatDuration) {
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  if (!video) throw new Error("Não encontrei uma faixa de vídeo nesse arquivo.");
  if (!audio) throw new Error("Esse vídeo não tem uma faixa de áudio para colocar na figurinha.");

  const overallDuration = Number(formatDuration);
  const streamRange = (stream) => {
    const start = Number.isFinite(Number(stream.start_time)) ? Number(stream.start_time) : 0;
    const parsedDuration = Number(stream.duration);
    const duration = Number.isFinite(parsedDuration) && parsedDuration > 0
      ? parsedDuration
      : overallDuration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Não consegui determinar a duração das faixas do vídeo.");
    }
    return { start, end: start + duration };
  };

  const videoRange = streamRange(video);
  const audioRange = streamRange(audio);
  const start = Math.max(videoRange.start, audioRange.start);
  const end = Math.min(videoRange.end, audioRange.end, overallDuration || Infinity);
  const overlap = Math.min(MAX_SOUND_STICKER_SECONDS, end - start);
  const frameCount = Math.floor(overlap * SOUND_STICKER_FPS + 1e-7);
  if (frameCount < 1) throw new Error("O trecho com áudio e vídeo em comum é curto demais.");

  return { start, duration: frameCount / SOUND_STICKER_FPS };
}

async function getCommonStickerSegment(inputPath, ffprobe = process.env.FFPROBE_PATH || "ffprobe") {
  try {
    const { stdout } = await execFileAsync(ffprobe, [
      "-v", "error", "-show_entries", "format=duration:stream=codec_type,duration,start_time",
      "-of", "json", inputPath,
    ], { timeout: 5000, maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(stdout);
    return commonStickerSegment(probe.streams || [], probe.format?.duration);
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error("Não consegui ler as informações de duração do vídeo.");
    if (error.code === "ENOENT") throw new Error("Não encontrei o ffprobe. Instale o pacote completo do FFmpeg.");
    throw error;
  }
}

async function convertToSticker(source, inputPath, outputPath, ffmpeg, segment) {
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  if (segment) args.push("-ss", String(segment.start));
  args.push("-i", inputPath);
  if (source.type === "video") args.push("-t", String(segment?.duration || 5));
  args.push(
    "-vf",
    stickerVideoFilter(segment),
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

async function extractStickerAudio(inputPath, outputPath, ffmpeg, segment) {
  try {
    await execFileAsync(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-y", "-ss", String(segment.start), "-i", inputPath,
      "-map", "0:a:0", "-vn", "-t", String(segment.duration),
      "-af", `atrim=duration=${segment.duration},asetpts=PTS-STARTPTS`, "-ac", "1", "-ar", "48000",
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
  commonStickerSegment,
  getCommonStickerSegment,
  stickerVideoFilter,
  convertVideoToGifVideo,
  extractStickerAudio,
  withMediaFile,
  gifVideoFilter,
};
